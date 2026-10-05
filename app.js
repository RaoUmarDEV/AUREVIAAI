/*
  AUREVIA AI frontend
  For GitHub Pages:
  1) Set API_BASE to your deployed backend URL.
  2) Never put your AI provider secret/API key in this file.
*/
const API_BASE = ""; // Example after deployment: "https://your-aurevia-backend.example.com"

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentMode = "topic";
let currentImageData = null;
let lastLesson = "";

$$(".source-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".source-tab").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    $$(".source-view").forEach(v => v.classList.remove("active"));
    $(`#${currentMode}Source`).classList.add("active");
  });
});

$("#fileInput").addEventListener("change", e => {
  const f = e.target.files[0];
  $("#fileName").textContent = f ? f.name : "Choose a file";
});

$("#imageInput").addEventListener("change", e => {
  const f = e.target.files[0];
  $("#imageName").textContent = f ? f.name : "Choose an image";
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentImageData = reader.result;
    $("#imagePreview").src = currentImageData;
    $("#imagePreview").style.display = "block";
  };
  reader.readAsDataURL(f);
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function markdownLite(text) {
  let html = escapeHtml(text);
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^\- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  html = html.replace(/\n\n/g, "<br><br>");
  return html;
}

function demoLesson(topic, language) {
  const t = topic || "your lecture";
  const langNote = language !== "English" ? `\n\nLanguage selected: **${language}**. Connect the backend to receive the full AI explanation in this language.` : "";
  return `## ${t}

### Core idea
Think of **${t}** as a concept that becomes easier when we break it into a few connected ideas. Start with the definition, understand the mechanism, then connect it to an example.

### What you should remember
- **Definition:** Learn the exact meaning first.
- **Mechanism:** Understand how and why it works.
- **Key terms:** Identify the vocabulary your teacher is likely to test.
- **Example:** Connect the concept to a real or familiar example.
- **Exam focus:** Be able to explain the idea in your own words.

### Quick revision
**One-line summary:** ${t} can be understood by moving from the basic definition → process → important terms → application.

### Active recall
Close your notes and explain **${t}** in 3–5 sentences. If you cannot, ask AUREVIA to explain the difficult part again.${langNote}`;
}

async function callAI(payload) {
  const url = `${API_BASE}/api/explain`;
  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("AI server unavailable");
  return response.json();
}

async function createLesson() {
  const language = $("#language").value;
  const learningMode = $("#mode").value;
  let payload = { language, learningMode, mode: currentMode };

  if (currentMode === "topic") {
    const topic = $("#topicInput").value.trim();
    if (!topic) return alert("Please enter a topic first.");
    payload.topic = topic;
  } else if (currentMode === "image") {
    if (!currentImageData) return alert("Please upload a lecture image first.");
    payload.image = currentImageData;
    payload.topic = $("#topicInput").value.trim();
  } else {
    const file = $("#fileInput").files[0];
    if (!file) return alert("Please choose a lecture file first.");
    if (file.size > 8 * 1024 * 1024) return alert("Please keep the file under 8MB.");
    if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      payload.text = await file.text();
    } else {
      payload.fileName = file.name;
      payload.fileNote = "A document was uploaded. Add a document parser/storage service on the backend for PDF/DOCX extraction.";
    }
  }

  $("#startBtn").disabled = true;
  $("#startBtn").innerHTML = "Creating your lesson <span>…</span>";
  try {
    let data;
    try {
      data = await callAI(payload);
    } catch {
      data = { title: payload.topic || "Your uploaded lecture", content: demoLesson(payload.topic || payload.fileName || "Your lecture", language) };
    }
    renderLesson(data.title || payload.topic || "AI Lesson", data.content || "No content returned.");
  } finally {
    $("#startBtn").disabled = false;
    $("#startBtn").innerHTML = "Create my lesson <span>→</span>";
  }
}

function renderLesson(title, content) {
  lastLesson = content;
  $("#emptyState").classList.add("hidden");
  $("#lessonState").classList.remove("hidden");
  $("#lessonTitle").textContent = title;
  $("#lessonContent").innerHTML = markdownLite(content);
  $("#chatMessages").innerHTML = '<div class="message ai">Your lesson is ready. Ask me anything about it.</div>';
  $("#lessonState").scrollIntoView({behavior:"smooth", block:"start"});
}

$("#startBtn").addEventListener("click", createLesson);
$("#newLesson").addEventListener("click", () => {
  $("#lessonState").classList.add("hidden");
  $("#emptyState").classList.remove("hidden");
  window.scrollTo({top: $("#workspace").offsetTop - 80, behavior:"smooth"});
});

async function sendChat(question = null) {
  const input = $("#chatInput");
  const q = (question || input.value).trim();
  if (!q) return;
  const box = $("#chatMessages");
  box.insertAdjacentHTML("beforeend", `<div class="message user">${escapeHtml(q)}</div>`);
  input.value = "";
  box.scrollTop = box.scrollHeight;

  let answer;
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        question:q,
        lecture:lastLesson,
        language:$("#language").value
      })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    answer = data.content;
  } catch {
    answer = `In demo mode: I would answer **${q}** using the current lecture as context. Connect the secure backend to activate live AI tutoring.`;
  }
  box.insertAdjacentHTML("beforeend", `<div class="message ai">${markdownLite(answer)}</div>`);
  box.scrollTop = box.scrollHeight;
}

$("#chatBtn").addEventListener("click", () => sendChat());
$("#chatInput").addEventListener("keydown", e => { if(e.key === "Enter") sendChat(); });

$$(".quick-tools button").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    const prompts = {
      summary: "Give me a concise revision summary of this lesson.",
      quiz: "Create 5 exam-style MCQs from this lesson and put the answers at the end.",
      flashcards: "Create 8 flashcards from this lesson using Question — Answer format."
    };
    sendChat(prompts[action]);
  });
});
