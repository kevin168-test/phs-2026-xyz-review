let allQuestions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let wrongAnswers = JSON.parse(localStorage.getItem('phs_wrong_answers') || '{}');

// Helper to clean Markdown characters
function cleanText(text) {
    if (!text) return "";
    return text.replace(/^>\s*/gm, '')      // Remove >
               .replace(/^\s*[\*\-]\s*/gm, '') // Remove * or -
               .replace(/\*\*/g, '')         // Remove **
               .trim();
}

// Initialize
async function init() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
    
    try {
        const response = await fetch('data/questions.json');
        allQuestions = await response.json();
        renderDashboard();
        updateMistakeCount();
    } catch (error) {
        console.error("Failed to load questions:", error);
    }
}

function updateMistakeCount() {
    const totalMistakes = Object.values(wrongAnswers).reduce((sum, list) => sum + list.length, 0);
    document.getElementById('mistake-count').innerText = totalMistakes;
}

function renderDashboard() {
    const list = document.getElementById('subject-list');
    list.innerHTML = '';
    
    Object.keys(allQuestions).forEach(fileId => {
        const subject = allQuestions[fileId];
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.innerHTML = `
            <div class="title">${subject.title.replace('歷年(110-114) ', '')}</div>
            <div class="stats">共 ${subject.questions.length} 題 | ${subject.categories.length} 個單元</div>
        `;
        card.onclick = () => startQuiz(fileId);
        list.appendChild(card);
    });

    document.getElementById('btn-review-mistakes').onclick = startMistakeQuiz;
}

// Sampling Logic: Weighted Random
function startQuiz(fileId) {
    const subject = allQuestions[fileId];
    const pool = subject.questions;
    const categories = subject.categories;
    const targetSize = 20;
    
    let sampled = [];
    
    categories.forEach(cat => {
        const catQuestions = pool.filter(q => q.category === cat.name);
        const totalInCat = cat.end - cat.start + 1;
        const subjectTotal = pool.length;
        
        let count = Math.round((totalInCat / subjectTotal) * targetSize);
        if (count < 1 && totalInCat > 0) count = 1;
        
        const shuffled = catQuestions.sort(() => 0.5 - Math.random());
        sampled = sampled.concat(shuffled.slice(0, count));
    });

    sampled = sampled.sort(() => 0.5 - Math.random());
    if (sampled.length > targetSize) {
        sampled = sampled.slice(0, targetSize);
    } else if (sampled.length < targetSize) {
        const remaining = pool.filter(q => !sampled.includes(q));
        const extra = remaining.sort(() => 0.5 - Math.random()).slice(0, targetSize - sampled.length);
        sampled = sampled.concat(extra);
    }

    currentQuiz = sampled.sort(() => 0.5 - Math.random());
    setupQuizView();
}

function startMistakeQuiz() {
    let allMistakes = [];
    Object.keys(wrongAnswers).forEach(fileId => {
        const subject = allQuestions[fileId];
        if (!subject) return;
        const mistakeIds = wrongAnswers[fileId];
        const qs = subject.questions.filter(q => mistakeIds.includes(q.id));
        allMistakes = allMistakes.concat(qs);
    });

    if (allMistakes.length === 0) {
        alert("目前沒有錯題紀錄！");
        return;
    }

    currentQuiz = allMistakes.sort(() => 0.5 - Math.random()).slice(0, 20);
    setupQuizView();
}

function setupQuizView() {
    currentIndex = 0;
    score = 0;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('result-view').classList.add('hidden');
    document.getElementById('quiz-view').classList.remove('hidden');
    showQuestion();
}

function showQuestion() {
    const q = currentQuiz[currentIndex];
    const container = document.getElementById('question-container');
    
    const progress = ((currentIndex + 1) / currentQuiz.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-text').innerText = `${currentIndex + 1} / ${currentQuiz.length}`;

    container.innerHTML = `
        <div class="q-card">
            <div class="q-category">${q.category}</div>
            <div class="q-text">${q.question}</div>
            <div class="options-list">
                ${Object.entries(q.options).map(([key, text]) => `
                    <button class="opt-btn" onclick="checkAnswer('${key}')">
                        <span class="opt-label">(${key})</span>
                        <span class="opt-text">${text}</span>
                    </button>
                `).join('')}
            </div>
            <div id="feedback" class="feedback-area hidden">
                <div class="hint-box">
                    <strong>💡 一句話判斷：</strong><br>${cleanText(q.hint)}
                </div>
                <div class="expl-box">
                    <strong>📋 專業解析：</strong><br>
                    <div style="white-space: pre-wrap; margin-top:10px">${cleanText(q.explanation)}</div>
                    <br>
                    <div style="background:#f8f9fa; padding:10px; border-radius:8px; color:#e67e22; font-size:0.85rem">
                        ${cleanText(q.warning)}<br>
                        <hr style="border:0; border-top:1px solid #eee; margin:10px 0">
                        ${q.tags}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-next-question').classList.add('hidden');
    document.getElementById('btn-finish-quiz').classList.add('hidden');
}

window.checkAnswer = function(choice) {
    const q = currentQuiz[currentIndex];
    const btns = document.querySelectorAll('.opt-btn');
    const feedback = document.getElementById('feedback');
    
    let correct = q.answer;
    if (correct === '#') {
        alert("本題考選部決議一律給分！");
        correct = choice;
    }

    btns.forEach(btn => {
        btn.disabled = true;
        const label = btn.querySelector('.opt-label').innerText.replace('(', '').replace(')', '');
        if (label === correct) {
            btn.classList.add('correct');
        }
        if (label === choice && choice !== correct) {
            btn.classList.add('wrong');
        }
    });

    if (choice === correct) {
        score++;
    } else {
        addToMistakes(q);
    }

    feedback.classList.remove('hidden');

    if (currentIndex < currentQuiz.length - 1) {
        document.getElementById('btn-next-question').classList.remove('hidden');
    } else {
        document.getElementById('btn-finish-quiz').classList.remove('hidden');
    }
};

function addToMistakes(q) {
    const parts = q.id.split('_');
    const fileId = parts.slice(0, -1).join('_');
    
    if (!wrongAnswers[fileId]) wrongAnswers[fileId] = [];
    if (!wrongAnswers[fileId].includes(q.id)) {
        wrongAnswers[fileId].push(q.id);
        localStorage.setItem('phs_wrong_answers', JSON.stringify(wrongAnswers));
        updateMistakeCount();
    }
}

document.getElementById('btn-next-question').onclick = () => {
    currentIndex++;
    showQuestion();
};

document.getElementById('btn-finish-quiz').onclick = () => {
    document.getElementById('quiz-view').classList.add('hidden');
    document.getElementById('result-view').classList.remove('hidden');
    document.getElementById('correct-count').innerText = score;
    document.getElementById('total-count').innerText = currentQuiz.length;
};

document.getElementById('btn-exit-quiz').onclick = () => {
    if (confirm("確定要離開本次測驗嗎？進度將不會儲存。")) {
        location.reload();
    }
};

init();
