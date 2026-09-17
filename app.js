// GREEN-WAY PDR ONLINE 2026
(function () {
  'use strict';

  const state = {
    questions: [],
    topics: [],
    category: localStorage.getItem('pdr_category') || 'B',
    theme: localStorage.getItem('pdr_theme') || 'light',
    soundEnabled: localStorage.getItem('pdr_sound') !== 'false',
    progress: JSON.parse(localStorage.getItem('pdr_progress') || '{}'),
    mistakes: JSON.parse(localStorage.getItem('pdr_mistakes') || '[]'),
    favorites: JSON.parse(localStorage.getItem('pdr_favorites') || '[]'),
    examHistory: JSON.parse(localStorage.getItem('pdr_exam_history') || '[]'),
    activeView: 'home',
    quiz: {
      mode: 'exam',
      title: '',
      questions: [],
      currentIndex: 0,
      userAnswers: {},
      mistakesCount: 0,
      timerSeconds: 1200,
      timerInterval: null,
      isFinished: false,
      startTime: 0,
      endTime: 0
    }
  };

  let audioCtx = null;
  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === 'correct') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'wrong') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.18);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  async function initApp() {
    setupTheme();
    setupSound();
    setupEventListeners();
    try {
      const [topicsRes, questionsRes] = await Promise.all([
        fetch('data/topics.json').then(r => r.json()),
        fetch('data/questions.json').then(r => r.json())
      ]);
      state.topics = topicsRes;
      state.questions = questionsRes;
      updateCategoryDropdown();
      updateBadgeCounts();
      updateHomeStats();
      renderHomeTopics();
      renderAllTopics();
      renderTickets();
      renderMistakesView();
      renderFavoritesView();
      console.log('PDR loaded:', state.questions.length);
    } catch (err) {
      console.error('Data load error:', err);
    }
  }

  function setupTheme() {
    if (state.theme === 'dark') {
      document.body.classList.add('dark-mode');
      const sun = document.querySelector('.sun-icon');
      const moon = document.querySelector('.moon-icon');
      if (sun) sun.style.display = 'none';
      if (moon) moon.style.display = 'inline';
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    state.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('pdr_theme', state.theme);
    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (sun) sun.style.display = isDark ? 'none' : 'inline';
    if (moon) moon.style.display = isDark ? 'inline' : 'none';
  }

  function setupSound() {
    updateSoundIcon();
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('pdr_sound', state.soundEnabled);
    updateSoundIcon();
  }

  function updateSoundIcon() {
    const son = document.querySelector('.sound-on');
    const soff = document.querySelector('.sound-off');
    if (son) son.style.display = state.soundEnabled ? 'inline' : 'none';
    if (soff) soff.style.display = state.soundEnabled ? 'none' : 'inline';
  }

  function updateCategoryDropdown() {
    const select = document.getElementById('category-select');
    if (select) select.value = state.category;
  }

  function filterQuestionsByCategory(qs, cat) {
    if (!cat || cat === 'ALL') return qs;
    return qs.filter(q => q.categories && (q.categories.includes(cat) || q.categories.includes('B')));
  }

  function showView(viewId) {
    if (state.activeView === 'quiz' && !state.quiz.isFinished && viewId !== 'quiz') {
      if (state.quiz.mode === 'exam' && !confirm('Ви дійсно бажаєте вийти з іспиту? Результат не збережеться.')) {
        return;
      }
      stopTimer();
    }
    state.activeView = viewId;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activePanel = document.getElementById('view-' + viewId);
    if (activePanel) activePanel.classList.add('active');
    const activeNavBtn = document.querySelector('.nav-btn[data-view="' + viewId + '"]');
    if (activeNavBtn) activeNavBtn.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewId === 'home') {
      updateHomeStats();
      renderHomeTopics();
    } else if (viewId === 'mistakes') {
      renderMistakesView();
    } else if (viewId === 'favorites') {
      renderFavoritesView();
    } else if (viewId === 'topics') {
      renderAllTopics();
    } else if (viewId === 'tickets') {
      renderTickets();
    }
  }

  function updateBadgeCounts() {
    const mistakesCountEl = document.querySelector('.count-mistakes');
    const favoritesCountEl = document.querySelector('.count-favorites');
    if (mistakesCountEl) {
      const cnt = state.mistakes.length;
      mistakesCountEl.textContent = cnt;
      mistakesCountEl.style.display = cnt > 0 ? 'inline-block' : 'none';
    }
    if (favoritesCountEl) {
      const cnt = state.favorites.length;
      favoritesCountEl.textContent = cnt;
      favoritesCountEl.style.display = cnt > 0 ? 'inline-block' : 'none';
    }
  }

  function updateHomeStats() {
    const passedKeys = Object.keys(state.progress);
    const passedCount = passedKeys.length;
    let correctCount = 0;
    passedKeys.forEach(k => {
      if (state.progress[k].isCorrect) correctCount++;
    });
    const accuracy = passedCount > 0 ? Math.round((correctCount / passedCount) * 100) : 0;
    const accEl = document.getElementById('home-stat-accuracy');
    if (accEl) accEl.textContent = accuracy + '%';
    const pasEl = document.getElementById('home-stat-passed');
    if (pasEl) pasEl.textContent = passedCount;
    const misEl = document.getElementById('home-stat-mistakes');
    if (misEl) misEl.textContent = state.mistakes.length;
    const exEl = document.getElementById('home-stat-exams');
    if (exEl) exEl.textContent = state.examHistory.filter(h => h.passed).length;
    const totEl = document.getElementById('home-stat-total');
    if (totEl) totEl.textContent = state.questions.length;
  }

  function renderHomeTopics() {
    const container = document.getElementById('home-topics-list');
    if (!container) return;
    container.innerHTML = '';
    const featuredIds = ['33', '34', '16.1', '16.2', '14', '35'];
    const featured = state.topics.filter(t => featuredIds.includes(t.id));
    featured.forEach(topic => {
      container.appendChild(createTopicCard(topic));
    });
  }

  function renderAllTopics(searchFilter = '') {
    const container = document.getElementById('all-topics-list');
    if (!container) return;
    container.innerHTML = '';
    const filterNorm = searchFilter.toLowerCase().trim();
    state.topics.forEach(topic => {
      if (filterNorm) {
        const textToSearch = (topic.id + ' ' + topic.title).toLowerCase();
        if (!textToSearch.includes(filterNorm)) return;
      }
      container.appendChild(createTopicCard(topic));
    });
  }

  function createTopicCard(topic) {
    const card = document.createElement('div');
    card.className = 'topic-card';
    const topicQs = state.questions.filter(q => q.section_id === topic.id);
    let answered = 0;
    topicQs.forEach(q => {
      if (state.progress[q.id]) answered++;
    });
    const percent = topicQs.length > 0 ? Math.round((answered / topicQs.length) * 100) : 0;
    card.innerHTML = `
      <div class="topic-card-header">
        <span class="topic-num-badge">Розділ ${topic.id}</span>
        <span class="badge ${percent === 100 ? 'badge-qnum' : 'badge-topic'}">${percent}% вивчено</span>
      </div>
      <h4>${topic.title}</h4>
      <div class="topic-meta">
        <span>Питань: <strong>${topic.count}</strong></span>
        ${topic.has_images_count > 0 ? `<span>Ілюстрацій: <strong>${topic.has_images_count}</strong></span>` : ''}
      </div>
      <div class="topic-progress-bg">
        <div class="topic-progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    card.addEventListener('click', () => {
      startTopicQuiz(topic.id);
    });
    return card;
  }

  function renderTickets() {
    const container = document.getElementById('all-tickets-list');
    if (!container) return;
    container.innerHTML = '';
    const qs = filterQuestionsByCategory(state.questions, state.category);
    const ticketsCount = Math.ceil(qs.length / 20);
    for (let i = 1; i <= ticketsCount; i++) {
      const ticketCard = document.createElement('div');
      ticketCard.className = 'ticket-card';
      const startIdx = (i - 1) * 20;
      const endIdx = Math.min(startIdx + 20, qs.length);
      const ticketQs = qs.slice(startIdx, endIdx);
      let answered = 0;
      ticketQs.forEach(q => {
        if (state.progress[q.id]) answered++;
      });
      const percent = Math.round((answered / ticketQs.length) * 100);
      ticketCard.innerHTML = `
        <div class="ticket-number">Білет ${i}</div>
        <div class="ticket-desc">${ticketQs.length} питань</div>
        <div class="ticket-status-pill ${percent === 100 ? 'badge-qnum' : 'badge-topic'}">${percent}%</div>
      `;
      ticketCard.addEventListener('click', () => {
        startTicketQuiz(i, ticketQs);
      });
      container.appendChild(ticketCard);
    }
  }

  function renderMistakesView() {
    const emptyState = document.getElementById('mistakes-empty-state');
    const readyState = document.getElementById('mistakes-ready-state');
    const countText = document.getElementById('mistakes-count-text');
    const listContainer = document.getElementById('mistakes-list');
    const clearBtn = document.getElementById('btn-clear-mistakes');
    if (state.mistakes.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (readyState) readyState.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (readyState) readyState.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (countText) countText.textContent = state.mistakes.length;
    if (listContainer) {
      listContainer.innerHTML = '';
      const mistakeQs = state.questions.filter(q => state.mistakes.includes(q.id));
      mistakeQs.slice(0, 40).forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'option-item';
        item.style.marginBottom = '0.5rem';
        item.innerHTML = `
          <div class="option-index">${idx + 1}</div>
          <div class="option-text">
            <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Розділ ${q.section_id} (№${q.number})</span>
            <strong>${q.question}</strong>
          </div>
        `;
        item.addEventListener('click', () => {
          startQuizSession([q], `Питання ${q.id}`, 'mistakes');
        });
        listContainer.appendChild(item);
      });
    }
  }

  function renderFavoritesView() {
    const emptyState = document.getElementById('favorites-empty-state');
    const readyState = document.getElementById('favorites-ready-state');
    const startBtn = document.getElementById('btn-start-favorites-quiz');
    const listContainer = document.getElementById('favorites-list');
    if (state.favorites.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (readyState) readyState.style.display = 'none';
      if (startBtn) startBtn.style.display = 'none';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (readyState) readyState.style.display = 'block';
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (listContainer) {
      listContainer.innerHTML = '';
      const favQs = state.questions.filter(q => state.favorites.includes(q.id));
      favQs.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'option-item';
        item.style.marginBottom = '0.5rem';
        item.innerHTML = `
          <div class="option-index">${idx + 1}</div>
          <div class="option-text">
            <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Розділ ${q.section_id} (№${q.number})</span>
            <strong>${q.question}</strong>
          </div>
        `;
        item.addEventListener('click', () => {
          startQuizSession(favQs, 'Обрані питання', 'favorites', idx);
        });
        listContainer.appendChild(item);
      });
    }
  }

  function startOfficialExam() {
    const cat = state.category;
    const catQuestions = filterQuestionsByCategory(state.questions, cat);
    const poolGeneral = catQuestions.filter(q => { const n = parseFloat(q.section_id); return n >= 1 && n <= 32; });
    const poolSigns = catQuestions.filter(q => ['33', '34'].includes(q.section_id));
    const poolSafety = catQuestions.filter(q => ['35', '38'].includes(q.section_id));
    const poolAidLaw = catQuestions.filter(q => ['36', '37', '39'].includes(q.section_id));
    const poolSpecial = catQuestions.filter(q => parseFloat(q.section_id) >= 40);
    function sampleRandom(arr, count) {
      const shuffled = [...arr].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    }
    const examQuestions = [
      ...sampleRandom(poolGeneral, 10),
      ...sampleRandom(poolSigns, 4),
      ...sampleRandom(poolSafety, 2),
      ...sampleRandom(poolAidLaw, 2),
      ...sampleRandom(poolSpecial.length >= 2 ? poolSpecial : poolGeneral, 2)
    ];
    if (examQuestions.length < 20) {
      const remaining = 20 - examQuestions.length;
      const others = catQuestions.filter(q => !examQuestions.some(eq => eq.id === q.id));
      examQuestions.push(...sampleRandom(others, remaining));
    }
    startQuizSession(examQuestions, `Офіційний іспит ТСЦ (${cat})`, 'exam');
  }

  function startTopicQuiz(topicId) {
    const topic = state.topics.find(t => t.id === topicId);
    const qs = state.questions.filter(q => q.section_id === topicId);
    if (!qs.length) return alert('У цьому розділі немає питань для поточної категорії.');
    startQuizSession(qs, `Розділ ${topicId}: ${topic ? topic.title : ''}`, 'topic');
  }

  function startTicketQuiz(ticketNum, ticketQs) {
    startQuizSession(ticketQs, `Екзаменаційний білет №${ticketNum}`, 'ticket');
  }

  function startMistakesQuiz() {
    const qs = state.questions.filter(q => state.mistakes.includes(q.id));
    if (!qs.length) return alert('У вас немає помилок для тренування!');
    startQuizSession(qs, 'Робота над помилками', 'mistakes');
  }

  function startMarathonQuiz() {
    const qs = filterQuestionsByCategory(state.questions, state.category);
    const shuffled = [...qs].sort(() => 0.5 - Math.random());
    startQuizSession(shuffled, `Марафон ПДР (${state.category})`, 'marathon');
  }

  function startQuizSession(questionList, title, mode, startIndex = 0) {
    state.quiz = {
      mode: mode,
      title: title,
      questions: questionList,
      currentIndex: startIndex,
      userAnswers: {},
      mistakesCount: 0,
      timerSeconds: 1200,
      timerInterval: null,
      isFinished: false,
      startTime: Date.now(),
      endTime: 0
    };
    const titleEl = document.getElementById('quiz-session-title');
    if (titleEl) titleEl.textContent = title;
    const timerBox = document.getElementById('quiz-timer-box');
    const mistakesBox = document.getElementById('quiz-mistakes-box');
    if (mode === 'exam') {
      if (timerBox) timerBox.style.display = 'inline-flex';
      if (mistakesBox) mistakesBox.style.display = 'flex';
      updateMistakesUI();
      startTimer();
    } else {
      if (timerBox) timerBox.style.display = 'none';
      if (mistakesBox) mistakesBox.style.display = 'none';
    }
    renderQuizPills();
    renderCurrentQuestion();
    showView('quiz');
  }

  function startTimer() {
    stopTimer();
    updateTimerUI();
    state.quiz.timerInterval = setInterval(() => {
      state.quiz.timerSeconds--;
      updateTimerUI();
      if (state.quiz.timerSeconds <= 0) {
        stopTimer();
        finishQuiz(true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.quiz.timerInterval) {
      clearInterval(state.quiz.timerInterval);
      state.quiz.timerInterval = null;
    }
  }

  function updateTimerUI() {
    const mins = Math.floor(state.quiz.timerSeconds / 60);
    const secs = state.quiz.timerSeconds % 60;
    const text = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const timerTextEl = document.getElementById('quiz-timer-text');
    const timerBox = document.getElementById('quiz-timer-box');
    if (timerTextEl) timerTextEl.textContent = text;
    if (timerBox) {
      if (state.quiz.timerSeconds <= 120) timerBox.classList.add('urgent');
      else timerBox.classList.remove('urgent');
    }
  }

  function updateMistakesUI() {
    const countEl = document.getElementById('quiz-mistakes-count');
    if (countEl) countEl.textContent = state.quiz.mistakesCount;
    document.querySelectorAll('.mistake-dot').forEach((dot, idx) => {
      if (idx < state.quiz.mistakesCount) dot.classList.add('active');
      else dot.classList.remove('active');
    });
  }

  function renderQuizPills() {
    const container = document.getElementById('quiz-pills-container');
    if (!container) return;
    container.innerHTML = '';
    state.quiz.questions.forEach((q, idx) => {
      const pill = document.createElement('button');
      pill.className = 'q-pill';
      pill.textContent = idx + 1;
      pill.setAttribute('data-index', idx);
      if (idx === state.quiz.currentIndex) pill.classList.add('current');
      if (state.favorites.includes(q.id)) pill.classList.add('bookmarked');
      const userAns = state.quiz.userAnswers[idx];
      if (userAns !== undefined) {
        if (userAns === q.correct_answer) pill.classList.add('correct');
        else pill.classList.add('wrong');
      }
      pill.addEventListener('click', () => goToQuestion(idx));
      container.appendChild(pill);
    });
  }

  function updateActivePill() {
    document.querySelectorAll('.q-pill').forEach((pill, idx) => {
      pill.classList.remove('current');
      if (idx === state.quiz.currentIndex) {
        pill.classList.add('current');
        pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      const q = state.quiz.questions[idx];
      if (state.favorites.includes(q.id)) pill.classList.add('bookmarked');
      else pill.classList.remove('bookmarked');
      const userAns = state.quiz.userAnswers[idx];
      if (userAns !== undefined) {
        if (userAns === q.correct_answer) pill.classList.add('correct');
        else pill.classList.add('wrong');
      }
    });
  }

  function goToQuestion(idx) {
    if (idx < 0 || idx >= state.quiz.questions.length) return;
    state.quiz.currentIndex = idx;
    updateActivePill();
    renderCurrentQuestion();
  }

  function renderCurrentQuestion() {
    const q = state.quiz.questions[state.quiz.currentIndex];
    if (!q) return;
    const topicEl = document.getElementById('q-section-title');
    if (topicEl) topicEl.textContent = `Розділ ${q.section_id}: ${q.section_title}`;
    const numEl = document.getElementById('q-number-label');
    if (numEl) numEl.textContent = `Питання ${state.quiz.currentIndex + 1} з ${state.quiz.questions.length}`;
    const favBtn = document.getElementById('q-favorite-btn');
    if (favBtn) {
      if (state.favorites.includes(q.id)) favBtn.classList.add('active');
      else favBtn.classList.remove('active');
    }
    const qTextEl = document.getElementById('q-text');
    if (qTextEl) qTextEl.textContent = q.question;
    const imgBox = document.getElementById('q-image-box');
    const imgEl = document.getElementById('q-image');
    if (q.image) {
      imgBox.style.display = 'block';
      imgEl.src = q.image;
    } else {
      imgBox.style.display = 'none';
      imgEl.src = '';
    }
    const optionsContainer = document.getElementById('q-options-container');
    optionsContainer.innerHTML = '';
    const alreadyAnswered = state.quiz.userAnswers[state.quiz.currentIndex] !== undefined;
    const userAnswer = state.quiz.userAnswers[state.quiz.currentIndex];
    q.options.forEach((optText, optIdx) => {
      const optNumber = optIdx + 1;
      const optBtn = document.createElement('div');
      optBtn.className = 'option-item';
      if (alreadyAnswered) {
        optBtn.classList.add('locked');
        if (optNumber === q.correct_answer) optBtn.classList.add('correct');
        else if (optNumber === userAnswer) optBtn.classList.add('wrong');
      }
      optBtn.innerHTML = `<div class="option-index">${optNumber}</div><div class="option-text">${optText}</div>`;
      if (!alreadyAnswered && !state.quiz.isFinished) {
        optBtn.addEventListener('click', () => selectAnswer(optNumber));
      }
      optionsContainer.appendChild(optBtn);
    });
    const explanationBox = document.getElementById('q-explanation-box');
    const explanationText = document.getElementById('q-explanation-text');
    if (alreadyAnswered) {
      explanationBox.style.display = 'block';
      explanationText.textContent = getExplanationForQuestion(q);
    } else {
      explanationBox.style.display = 'none';
    }
    const prevBtn = document.getElementById('btn-prev-q');
    const nextBtn = document.getElementById('btn-next-q');
    if (prevBtn) {
      prevBtn.disabled = state.quiz.currentIndex === 0;
      prevBtn.style.opacity = state.quiz.currentIndex === 0 ? '0.5' : '1';
    }
    if (nextBtn) {
      if (state.quiz.currentIndex === state.quiz.questions.length - 1) {
        nextBtn.innerHTML = '<span>Завершити</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      } else {
        nextBtn.innerHTML = '<span>Наступне</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"></path></svg>';
      }
    }
  }

  function selectAnswer(optNumber) {
    const qIndex = state.quiz.currentIndex;
    const q = state.quiz.questions[qIndex];
    if (!q || state.quiz.userAnswers[qIndex] !== undefined) return;
    state.quiz.userAnswers[qIndex] = optNumber;
    const isCorrect = (optNumber === q.correct_answer);
    state.progress[q.id] = { answer: optNumber, isCorrect: isCorrect, timestamp: Date.now() };
    localStorage.setItem('pdr_progress', JSON.stringify(state.progress));
    if (isCorrect) {
      playSound('correct');
      if (state.mistakes.includes(q.id)) {
        state.mistakes = state.mistakes.filter(id => id !== q.id);
        localStorage.setItem('pdr_mistakes', JSON.stringify(state.mistakes));
        updateBadgeCounts();
      }
    } else {
      playSound('wrong');
      state.quiz.mistakesCount++;
      if (!state.mistakes.includes(q.id)) {
        state.mistakes.push(q.id);
        localStorage.setItem('pdr_mistakes', JSON.stringify(state.mistakes));
        updateBadgeCounts();
      }
      if (state.quiz.mode === 'exam') {
        updateMistakesUI();
        if (state.quiz.mistakesCount >= 3) {
          renderCurrentQuestion();
          updateActivePill();
          setTimeout(() => finishQuiz(false), 700);
          return;
        }
      }
    }
    renderCurrentQuestion();
    updateActivePill();
    const totalAnswered = Object.keys(state.quiz.userAnswers).length;
    if (totalAnswered === state.quiz.questions.length) {
      setTimeout(() => finishQuiz(), 700);
    } else {
      setTimeout(() => {
        if (qIndex === state.quiz.currentIndex && qIndex < state.quiz.questions.length - 1) {
          goToQuestion(qIndex + 1);
        }
      }, 600);
    }
  }

  function finishQuiz(forced = false) {
    stopTimer();
    state.quiz.isFinished = true;
    state.quiz.endTime = Date.now();
    const questions = state.quiz.questions;
    let correct = 0;
    let mistakes = 0;
    questions.forEach((q, idx) => {
      const userAns = state.quiz.userAnswers[idx];
      if (userAns === q.correct_answer) correct++;
      else mistakes++;
    });
    const passed = (state.quiz.mode === 'exam') ? (mistakes <= 2) : (mistakes === 0 || correct / questions.length >= 0.9);
    const elapsedSecs = Math.max(1, Math.round((state.quiz.endTime - state.quiz.startTime) / 1000));
    const elapsedMins = Math.floor(elapsedSecs / 60);
    const elapsedSecRemain = elapsedSecs % 60;
    const timeStr = `${elapsedMins}:${elapsedSecRemain.toString().padStart(2, '0')}`;
    const percent = Math.round((correct / questions.length) * 100);
    if (state.quiz.mode === 'exam') {
      state.examHistory.push({
        date: new Date().toISOString(),
        category: state.category,
        correct: correct,
        mistakes: mistakes,
        passed: passed,
        time: timeStr
      });
      localStorage.setItem('pdr_exam_history', JSON.stringify(state.examHistory));
    }
    const modal = document.getElementById('exam-result-modal');
    const iconEl = document.getElementById('result-status-icon');
    const titleEl = document.getElementById('result-status-title');
    const subEl = document.getElementById('result-status-subtitle');
    if (passed) {
      iconEl.textContent = '🎉';
      titleEl.textContent = 'Іспит складено успішно!';
      subEl.textContent = `Чудова робота! Ви припустилися ${mistakes} ${getMistakesPlural(mistakes)} і підтвердили відмінні знання ПДР України.`;
    } else {
      iconEl.textContent = '⚠️';
      titleEl.textContent = 'Іспит не складено';
      subEl.textContent = `Ви припустилися ${mistakes} ${getMistakesPlural(mistakes)} (дозволено максимум 2). Опрацюйте помилки та спробуйте ще раз!`;
    }
    document.getElementById('res-correct-count').textContent = correct;
    document.getElementById('res-mistakes-count').textContent = mistakes;
    document.getElementById('res-time-taken').textContent = timeStr;
    document.getElementById('res-percent').textContent = `${percent}%`;
    modal.style.display = 'flex';
  }

  function getMistakesPlural(n) {
    if (n === 1) return 'помилки';
    if (n >= 2 && n <= 4) return 'помилок';
    return 'помилок';
  }

  function getExplanationForQuestion(q) {
    const ansNum = q.correct_answer;
    const optText = q.options[ansNum - 1] || '';
    return `Правильна відповідь: №${ansNum} («${optText}»). Відповідає вимогам чинних Правил дорожнього руху України (Наказ ГСЦ МВС №225).`;
  }

  function toggleCurrentFavorite() {
    const q = state.quiz.questions[state.quiz.currentIndex];
    if (!q) return;
    const idx = state.favorites.indexOf(q.id);
    if (idx === -1) state.favorites.push(q.id);
    else state.favorites.splice(idx, 1);
    localStorage.setItem('pdr_favorites', JSON.stringify(state.favorites));
    updateBadgeCounts();
    const favBtn = document.getElementById('q-favorite-btn');
    if (favBtn) favBtn.classList.toggle('active');
    updateActivePill();
  }

  function setupEventListeners() {
    document.getElementById('brand-home-btn')?.addEventListener('click', () => showView('home'));
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'exam-start') startOfficialExam();
        else showView(view);
      });
    });
    document.getElementById('btn-hero-exam')?.addEventListener('click', startOfficialExam);
    document.getElementById('btn-hero-marathon')?.addEventListener('click', startMarathonQuiz);
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const action = card.dataset.action;
        if (action === 'exam') startOfficialExam();
        else if (action === 'topics') showView('topics');
        else if (action === 'tickets') showView('tickets');
        else if (action === 'mistakes') showView('mistakes');
        else if (action === 'favorites') showView('favorites');
        else if (action === 'marathon') startMarathonQuiz();
      });
    });
    document.getElementById('category-select')?.addEventListener('change', (e) => {
      state.category = e.target.value;
      localStorage.setItem('pdr_category', state.category);
      renderTickets();
      renderHomeTopics();
      renderAllTopics();
    });
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('sound-toggle-btn')?.addEventListener('click', toggleSound);
    document.getElementById('topic-search-input')?.addEventListener('input', (e) => renderAllTopics(e.target.value));
    document.getElementById('btn-start-mistakes-quiz')?.addEventListener('click', startMistakesQuiz);
    document.getElementById('btn-clear-mistakes')?.addEventListener('click', () => {
      if (confirm('Очистити список помилок?')) {
        state.mistakes = [];
        localStorage.setItem('pdr_mistakes', '[]');
        updateBadgeCounts();
        renderMistakesView();
      }
    });
    document.getElementById('btn-start-favorites-quiz')?.addEventListener('click', () => {
      const favQs = state.questions.filter(q => state.favorites.includes(q.id));
      startQuizSession(favQs, 'Обрані питання', 'favorites');
    });
    document.getElementById('quiz-back-btn')?.addEventListener('click', () => showView('home'));
    document.getElementById('btn-prev-q')?.addEventListener('click', () => goToQuestion(state.quiz.currentIndex - 1));
    document.getElementById('btn-next-q')?.addEventListener('click', () => {
      if (state.quiz.currentIndex === state.quiz.questions.length - 1) finishQuiz();
      else goToQuestion(state.quiz.currentIndex + 1);
    });
    document.getElementById('btn-finish-quiz-early')?.addEventListener('click', () => {
      if (confirm('Завершити тестування зараз?')) finishQuiz();
    });
    document.getElementById('q-favorite-btn')?.addEventListener('click', toggleCurrentFavorite);
    const qImage = document.getElementById('q-image');
    const zoomBtn = document.getElementById('btn-zoom-img');
    const lightbox = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close-btn');
    function openLightbox() {
      if (qImage && qImage.src) {
        lightboxImg.src = qImage.src;
        lightbox.style.display = 'flex';
      }
    }
    qImage?.addEventListener('click', openLightbox);
    zoomBtn?.addEventListener('click', openLightbox);
    lightboxClose?.addEventListener('click', () => lightbox.style.display = 'none');
    lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.style.display = 'none'; });
    document.getElementById('btn-result-review-mistakes')?.addEventListener('click', () => {
      document.getElementById('exam-result-modal').style.display = 'none';
      const firstMistakeIdx = state.quiz.questions.findIndex((q, idx) => state.quiz.userAnswers[idx] !== q.correct_answer);
      if (firstMistakeIdx !== -1) goToQuestion(firstMistakeIdx);
    });
    document.getElementById('btn-result-retry')?.addEventListener('click', () => {
      document.getElementById('exam-result-modal').style.display = 'none';
      if (state.quiz.mode === 'exam') startOfficialExam();
      else startQuizSession(state.quiz.questions, state.quiz.title, state.quiz.mode);
    });
    document.getElementById('btn-result-home')?.addEventListener('click', () => {
      document.getElementById('exam-result-modal').style.display = 'none';
      showView('home');
    });
    window.addEventListener('keydown', (e) => {
      if (state.activeView !== 'quiz') return;
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        selectAnswer(parseInt(e.key, 10));
      } else if (e.key === 'ArrowLeft') {
        goToQuestion(state.quiz.currentIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (state.quiz.currentIndex === state.quiz.questions.length - 1) finishQuiz();
        else goToQuestion(state.quiz.currentIndex + 1);
      } else if (e.key === 'Escape') {
        if (lightbox && lightbox.style.display === 'flex') lightbox.style.display = 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
