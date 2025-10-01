(function () {
  'use strict';

  const STORAGE_KEY = 'soullens_history_v1';

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  // SỬA ĐỔI: Thêm hàm fmtTimeShort cho biểu đồ, giữ lại hàm fmtTime cho lịch sử
  function fmtTime(ts = Date.now()) {
    const d = new Date(ts);
    return d.toLocaleString();
  }
  function fmtTimeShort(ts = Date.now()) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function saveHistoryArray(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr || []));
  }
  function loadHistoryArray() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed parse history', e);
      return [];
    }
  }

  /* ========== DOM references ========== */
  const openVipModalBtn = $('#openVipModalBtn');
  const vipModal = $('#vipModal');
  const closeVipModalBtn = $('#closeVipModalBtn');
  const welcomeToast = $('#welcomeToast');
  const taskbar = $('#taskbar');
  const openTaskBtn = $('#openTaskBtn');
  const taskToggleBtn = $('#taskToggleBtn');
  const themeBtn = $('#themeBtn');
  const brightnessRange = $('#brightness');

  const chatInput = $('#chatInput');
  const sendChatBtn = $('#sendChat');
  const messagesEl = $('#messages');
  const chatStatus = $('#chatStatus');

  const imgInput = $('#imgInput');
  const imgPreview = $('#imgPreview');
  const analyzeImgBtn = $('#analyzeImgBtn');
  const clearImgBtn = $('#clearImgBtn');
  const imgResult = $('#imgResult');

  const audioInput = $('#audioInput');
  const audioPlayer = $('#audioPlayer');
  const analyzeAudioBtn = $('#analyzeAudioBtn');
  const clearAudioBtn = $('#clearAudioBtn');
  const audioResult = $('#audioResult');

  const lastResult = $('#lastResult');
  const historyEl = $('#history');
  const clearHistoryBtn = $('#clearHistory');
  const actionTipsEl = $('#actionTips');

  const toastEl = $('#toast');

  // **THÊM MỚI**: DOM references cho camera
  const startCamBtn = $('#startCamBtn');
  const webcam = $('#webcam');
  const canvas = $('#canvas');
  // **THÊM MỚI**: DOM references cho Modal Biểu Đồ
  const openHistoryBtn = $('#openHistory');
  const historyModal = $('#historyModal');
  const closeModalBtn = $('#closeModalBtn');
  const historyChartCanvas = $('#historyChartCanvas');
  let historyChartInstance = null; // Biến để lưu trữ biểu đồ
  const chartAnalysisEl = $('#chartAnalysis');
  // **THÊM MỚI**: DOM references cho Chat Bubble
const chatBubble = $('#chatBubble');
const chatModal = $('#chatModal');

  /* ========== UI helpers ========== */
  function setChatStatus(text) {
    chatStatus.textContent = `Status: ${text}`;
  }

  // Toast (global, used by inline onclick in HTML)
  window.showToast = function showToast(message, timeout = 3500) {
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateY(0)';
    if (showToast._timer) clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(8px)';
      setTimeout(() => toastEl.style.display = 'none', 300);
    }, timeout);
  };

  // Demo mode toggle (global, used by inline onclick)
  window.toggleDemoMode = function toggleDemoMode() {
    document.body.classList.toggle('demo-mode');
    const is = document.body.classList.contains('demo-mode');
    showToast(is ? 'Chế độ demo: ON — Mô phỏng kết quả' : 'Chế độ demo: OFF');
    // If demo on and no history, add sample item
    if (is && loadHistoryArray().length === 0) {
      const sample = {
        id: 'sample-1',
        type: 'chat',
        input: 'Hôm nay mình thấy hơi chán, không muốn làm gì cả.',
        result: generateSoulResponse('Hôm nay mình thấy hơi chán, không muốn làm gì cả.'),
        ts: Date.now()
      };
      const arr = [sample].concat(loadHistoryArray());
      saveHistoryArray(arr);
      renderHistory();
    }
  };

  /* ========== Taskbar, theme, brightness ========= */
  openTaskBtn.addEventListener('click', () => {
    taskbar.classList.toggle('hidden');
  });
  if (taskToggleBtn) {
    taskToggleBtn.addEventListener('click', () => {
      taskbar.classList.add('hidden');
    });
  }

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const dark = document.body.classList.contains('dark');
    themeBtn.textContent = dark ? '☀️' : '🌙';
    showToast(dark ? 'Đã chuyển sang giao diện tối' : 'Đã chuyển sang giao diện sáng');
  });

  brightnessRange.addEventListener('input', (e) => {
    const val = e.target.value;
    const appEl = $('#root');
    if (appEl) appEl.style.filter = `brightness(${val}%)`;
  });
  /* ========== Biểu Đồ Lịch Sử (PHẦN MỚI THÊM VÀO) ========== */
  const emotionScores = {
    'Vui vẻ': 5, 'Tự tin': 4, 'Hứng thú': 4,
    'Bình thường': 3, 'Bình yên': 3, 'Bình tĩnh': 3, 'Ngạc nhiên': 3,
    'Trầm tư': 2, 'Lo lắng': 2, 'Lo lắng nhẹ': 2,
    'Buồn': 1, 'Nóng nảy': 0, 'Tức giận': 0, 'Ghê tởm': 0, 'Năng nổ / Cáu kỉnh': 0,
    'default': 2
  };
  const scoreToLabel = {
      5: 'Rất Tích Cực', 4: 'Tích Cực', 3: 'Trung Tính',
      2: 'Tiêu Cực', 1: 'Rất Tiêu Cực', 0: 'Phản ứng Mạnh'
  };
  // **THAY THẾ HÀM CŨ BẰNG HÀM MỚI NÀY**
function analyzeHistoryAndSuggest(history) {
    if (history.length < 5) { // Cần ít nhất 5 điểm dữ liệu để phân tích tốt hơn
      return "<p>Chưa đủ dữ liệu để đưa ra phân tích sâu. Hãy tiếp tục sử dụng ứng dụng để AI có thể hiểu bạn rõ hơn nhé!</p>";
    }

    // --- Giai đoạn 1: Thu thập và tính toán dữ liệu ---
    const scores = history.map(item => {
      const topEmotion = (item.emotions && item.emotions[0]?.name) || 'default';
      return emotionScores[topEmotion] || emotionScores.default;
    });

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // Tính toán xu hướng
    const firstHalfAvg = scores.slice(0, Math.floor(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(scores.length / 2);
    const secondHalfAvg = scores.slice(Math.floor(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(scores.length / 2);
    const trend = secondHalfAvg - firstHalfAvg;

    // Tính toán độ biến động (Volatility)
    const mean = avgScore;
    const volatility = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / scores.length);

    // Đếm tần suất các loại cảm xúc
    let positiveCount = 0;
    let negativeCount = 0;
    const emotionFrequency = {};
    history.forEach(item => {
        const emotionName = (item.emotions && item.emotions[0]?.name) || 'default';
        const score = emotionScores[emotionName] || emotionScores.default;
        if (score >= 4) positiveCount++;
        if (score <= 1) negativeCount++;
        if (emotionName !== 'default') {
            emotionFrequency[emotionName] = (emotionFrequency[emotionName] || 0) + 1;
        }
    });

    // --- Giai đoạn 2: Tạo ra các nhận định từ dữ liệu ---
    let analysisHTML = "<h4>Tổng Quan</h4>";

    // Nhận định về trạng thái chung
    if (avgScore > 3.5) {
        analysisHTML += `<p>Nhìn chung, trạng thái của bạn trong giai đoạn này nghiêng về hướng <strong>tích cực</strong>. (${Math.round((positiveCount / history.length) * 100)}% thời gian).</p>`;
    } else if (avgScore < 2.5) {
        analysisHTML += `<p>AI nhận thấy trạng thái của bạn có xu hướng <strong>tiêu cực</strong> nhiều hơn trong giai đoạn này. (${Math.round((negativeCount / history.length) * 100)}% thời gian).</p>`;
    } else {
        analysisHTML += "<p>Trạng thái cảm xúc của bạn trong giai đoạn này khá <strong>cân bằng và ổn định</strong>.</p>";
    }

    analysisHTML += "<h4>Phân Tích Chuyên Sâu</h4><ul>";

    // Nhận định về xu hướng
    if (trend > 0.5) {
        analysisHTML += "<li><strong>Xu hướng cải thiện:</strong> AI nhận thấy trạng thái của bạn đang tốt dần lên. Đây là một tín hiệu rất đáng mừng!</li>";
    } else if (trend < -0.5) {
        analysisHTML += "<li><strong>Xu hướng đi xuống:</strong> Có vẻ như gần đây bạn đang có nhiều thời điểm cảm xúc tiêu cực hơn. Đây là lúc cần chú ý đến bản thân nhiều hơn.</li>";
    }

    // Nhận định về độ biến động
    if (volatility > 1.4) {
        analysisHTML += "<li><strong>Cảm xúc biến động:</strong> AI nhận thấy cảm xúc của bạn có sự thay đổi lớn, đôi khi đi từ rất vui vẻ đến buồn bã. Điều này có thể cho thấy một giai đoạn nhiều sự kiện và thử thách.</li>";
    }

    // Nhận định về cảm xúc lặp lại
    const mostFrequentNegative = Object.entries(emotionFrequency)
        .filter(([name, count]) => emotionScores[name] <= 1)
        .sort((a, b) => b[1] - a[1]);
    
    if (mostFrequentNegative.length > 0 && mostFrequentNegative[0][1] > 1) {
        analysisHTML += `<li><strong>Điểm cần chú ý:</strong> Cảm xúc '<strong>${mostFrequentNegative[0][0]}</strong>' xuất hiện khá thường xuyên. Đây có thể là một tín hiệu cảm xúc quan trọng mà bạn nên dành thời gian để tìm hiểu.</li>`;
    }

    analysisHTML += "</ul><h4>Gợi Ý Từ AI</h4><ul>";

    // --- Giai đoạn 3: Đưa ra gợi ý dựa trên nhận định ---
    if (trend < -0.5) {
        analysisHTML += "<li>Hãy thử dành 5 phút cuối ngày để viết ra 3 điều tốt đẹp đã xảy ra, dù là nhỏ nhất. Việc này giúp tái tập trung vào những điểm sáng và cân bằng lại góc nhìn.</li>";
    }

    if (volatility > 1.4) {
        analysisHTML += "<li>Khi cảm thấy cảm xúc thay đổi đột ngột, các bài tập hít thở sâu hoặc kỹ thuật 'tiếp đất' (tập trung vào 5 thứ bạn thấy, 4 thứ bạn chạm,...) có thể giúp bạn bình tĩnh và trở về với hiện tại.</li>";
    }
    
    if (negativeCount > history.length / 3) { // Nếu hơn 1/3 thời gian là tiêu cực
         analysisHTML += "<li>Vì có nhiều cảm xúc tiêu cực, hãy thử dành thời gian cho một hoạt động bạn thực sự yêu thích mà không bị phân tâm, ví dụ như đọc sách, đi dạo trong công viên hoặc nghe một playlist nhạc nhẹ nhàng.</li>";
    }

    if (avgScore > 3.5) {
         analysisHTML += "<li>Bạn đang làm rất tốt việc duy trì trạng thái tích cực! Hãy tiếp tục phát huy những thói quen tốt và chia sẻ năng lượng này với những người xung quanh nhé.</li>";
    }
    
    analysisHTML += "</ul>";

    return analysisHTML;
}

  // THAY THẾ HÀM CŨ BẰNG PHIÊN BẢN NÂNG CẤP NÀY
// THAY THẾ TOÀN BỘ HÀM CŨ BẰNG PHIÊN BẢN ĐẦY ĐỦ NÀY
async function showHistoryChart() {
  const history = loadHistoryArray();
  if (history.length === 0) {
    showToast('Chưa có dữ liệu lịch sử.');
    return;
  }

  // Hiển thị modal và trạng thái "đang chờ" cho phần phân tích AI
  chartAnalysisEl.innerHTML = '<p class="loading-text">AI đang phân tích dữ liệu của bạn, vui lòng đợi...</p>';
  historyModal.style.display = 'flex';
  setTimeout(() => historyModal.classList.add('visible'), 10);

  // --- PHẦN VẼ BIỂU ĐỒ (QUAN TRỌNG, CÓ THỂ BẠN ĐÃ THIẾU PHẦN NÀY) ---
  if (historyChartInstance) historyChartInstance.destroy();
  const processedData = history.slice().reverse().map(item => {
    const topEmotion = (item.emotions && item.emotions[0]?.name) || 'default';
    return { label: fmtTimeShort(item.ts), score: emotionScores[topEmotion] || emotionScores.default };
  });
  const ctx = historyChartCanvas.getContext('2d');
  historyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: processedData.map(d => d.label),
        datasets: [{
          label: 'Trạng Thái Cảm Xúc',
          data: processedData.map(d => d.score),
          fill: true,
          backgroundColor: 'rgba(124, 92, 255, 0.2)',
          borderColor: 'rgba(124, 92, 255, 1)',
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: { callback: (value) => scoreToLabel[value] || '' },
            suggestedMin: 0,
            suggestedMax: 5
          }
        }
      }
  });
  // --- KẾT THÚC PHẦN VẼ BIỂU ĐỒ ---

  // Lấy phân tích từ AI và hiển thị (Phần này bạn đã có)
  try {
    const analysisText = await getAIHistoryAnalysis(history);
    const formattedHtml = analysisText
      .replace(/\*\*(.*?)\*\*/g, '<h4>$1</h4>')
      .replace(/\n/g, '<br>');
    
    chartAnalysisEl.innerHTML = formattedHtml;
  } catch (error) {
    chartAnalysisEl.innerHTML = '<p>Xin lỗi, đã có lỗi xảy ra khi kết nối với AI để phân tích. Vui lòng thử lại sau.</p>';
  }
}

 function closeHistoryChart() {
    historyModal.classList.remove('visible');
    setTimeout(() => historyModal.style.display = 'none', 250);
} // Hàm này kết thúc ở đây

// --- Dán toàn bộ code VIP Modal vào đúng vị trí này ---
function showVipModal() {
  vipModal.style.display = 'flex';
  setTimeout(() => vipModal.classList.add('visible'), 10);
}

function closeVipModal() {
  vipModal.classList.remove('visible');
  setTimeout(() => vipModal.style.display = 'none', 250);
}
openVipModalBtn.addEventListener('click', showVipModal);
closeVipModalBtn.addEventListener('click', closeVipModal);
vipModal.addEventListener('click', (e) => {
  if (e.target === vipModal) {
    closeVipModal();
  }
});
   

  openHistoryBtn.addEventListener('click', showHistoryChart);
  closeModalBtn.addEventListener('click', closeHistoryChart);
  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) closeHistoryChart();
  });

  /* ========== Camera & Real-time AI analysis ========== */
  // **TOÀN BỘ PHẦN CODE ĐỂ TÍCH HỢP CAMERA SẼ NẰM Ở ĐÂY**

  let stream; // Biến để lưu luồng video từ camera
  let analysisInterval; // Biến để lặp lại việc phân tích

  // Bản đồ cảm xúc để hiển thị kết quả từ Python backend
  const emotionMap = {
    happy: { icon: '😊', vi: 'Vui vẻ' },
    sad: { icon: '😢', vi: 'Buồn' },
    angry: { icon: '😠', vi: 'Tức giận' },
    surprise: { icon: '😮', vi: 'Ngạc nhiên' },
    fear: { icon: '😨', vi: 'Lo lắng' },
    neutral: { icon: '😐', vi: 'Bình tĩnh' },
    disgust: { icon: '🤢', vi: 'Ghê tởm' }
  };

  // Xử lý sự kiện khi nhấn nút Bật/Tắt Camera
  if (startCamBtn) {
    startCamBtn.addEventListener('click', async () => {
      if (stream) { // Nếu camera đang bật -> tắt nó đi
        stream.getTracks().forEach(track => track.stop());
        webcam.style.display = 'none';
        stream = null;
        startCamBtn.textContent = 'Bật Camera';
        clearInterval(analysisInterval);
        setChatStatus('Ready');
      } else { // Nếu camera đang tắt -> bật nó lên
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          webcam.srcObject = stream;
          webcam.style.display = 'block';
          startCamBtn.textContent = 'Tắt Camera';
          // Bắt đầu phân tích sau mỗi 2.5 giây
          analysisInterval = setInterval(analyzeFrame, 1000);
        } catch (err) {
          console.error("Lỗi bật camera:", err);
          showToast("Không thể truy cập camera. Vui lòng cấp quyền.");
        }
      }
    });
  }

  // Hàm chụp khung hình và gửi đến backend Python để phân tích
  async function analyzeFrame() {
    if (!stream) return;

    // Vẽ frame từ video vào canvas ẩn
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg');

    setChatStatus('Đang phân tích...');
    try {
      // Gửi ảnh đến backend Python
      const response = await fetch('http://127.0.0.1:5000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      const result = await response.json(); // Nhận kết quả { emotion_en: 'happy', emotion_vi: 'Vui vẻ' }
      
      // Sử dụng các hàm có sẵn để hiển thị kết quả và lưu lịch sử
      if (result && result.emotion_en) {
          const emotionData = emotionMap[result.emotion_en] || { icon: '🤷‍♂️', vi: result.emotion_vi };
          
          const resultObj = {
              id: 'cam-' + Date.now(),
              type: 'camera',
              inputName: 'Camera trực tiếp',
              ts: Date.now(),
              emotions: [{
                  name: emotionData.vi,
                  emoji: emotionData.icon,
                  confidence: 90 // Giả định độ tin cậy
              }]
          };

          displayResult(resultObj); // Dùng hàm hiển thị kết quả có sẵn
          const hist = loadHistoryArray();
          saveHistoryArray([resultObj].concat(hist)); // Dùng hàm lưu lịch sử có sẵn
          renderHistory(); // Dùng hàm render lịch sử có sẵn
      }
      setChatStatus('Ready');
    } catch (error) {
      console.error('Lỗi khi phân tích camera frame:', error);
      setChatStatus('Lỗi kết nối');
      // Dừng phân tích nếu có lỗi (ví dụ: server python chưa chạy)
      clearInterval(analysisInterval);
      showToast('Lỗi kết nối tới server AI. Vui lòng kiểm tra lại.');
    }
  }


  /* ========== Chat functionality (KHÔNG THAY ĐỔI) ========== */

  // Append message to messages panel
  function appendMessage(who = 'assistant', text = '', emoji = '') {
    const div = document.createElement('div');
    div.className = 'msg' + (who === 'you' ? ' you' : '');

    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    metaDiv.textContent = who === 'you' ? 'You' : 'Assistant';
    if (emoji) {
      metaDiv.innerHTML += ` <span class="emoji-icon">${emoji}</span>`;
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'msg-text';
    textDiv.textContent = text;
    
    div.appendChild(metaDiv);
    div.appendChild(textDiv);
    messagesEl.appendChild(div);

    // scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight + 100;
  }

  // Get emoji based on mood
  function getMoodEmoji(mood) {
    switch (mood) {
      case 'happy': return '😊';
      case 'sad': return '😔';
      case 'angry': return '😤';
      case 'anxious': return '😟';
      case 'curious': return '🤔';
      case 'neutral': return '😐';
      default: return '';
    }
  }

  // Detect simple mood from user text (keyword-based)
  function detectMood(text = '') {
    const s = text.toLowerCase();
    const happy = ['vui', 'vui vẻ', 'tuyệt', 'tốt', 'vui quá', 'vui', 'yeah', 'hạnh phúc', 'vui sướng', 'ngon'];
    const sad = ['buồn', 'chán', 'mệt', 'tuyệt vọng', 'cô đơn', 'khóc', 'đau', 'stress', 'mệt mỏi'];
    const angry = ['giận', 'bực', 'phẫn nộ', 'tức', 'ghét'];
    const anxious = ['lo', 'lo lắng', 'bồn chồn', 'hồi hộp', 'áp lực'];

    if (happy.some(k => s.includes(k))) return 'happy';
    if (sad.some(k => s.includes(k))) return 'sad';
    if (angry.some(k => s.includes(k))) return 'angry';
    if (anxious.some(k => s.includes(k))) return 'anxious';
    // detect question with "?" maybe confused/curious
    if (s.includes('?')) return 'curious';
    return 'neutral';
  }

  // Generate empathetic 3-5 sentences response (Vietnamese),
  // Always returns at least 3 sentences, up to 5.
  function generateSoulResponse(userText = '') {
    const mood = detectMood(userText);
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    // sentence pools per mood
    const pools = {
      happy: [
        "Nghe giọng bạn là mình thấy vui lây — thật tuyệt khi bạn đang có khoảnh khắc tốt đẹp.",
        "Hãy tận hưởng điều đó, ghi lại vài điều khiến bạn mỉm cười hôm nay để giữ cảm xúc tích cực lâu hơn.",
        "Nếu muốn chia sẻ thêm, mình rất thích nghe câu chuyện đó — kể cho mình nghe nhé.",
        "Những phút giây hạnh phúc nhỏ nhoi cũng quan trọng, mình luôn ở đây để ăn mừng cùng bạn."
      ],
      sad: [
        "Mình nghe thấy bạn đang buồn và mình rất đồng cảm — mệt mỏi, chán nản đôi khi đến tự nhiên như vậy mà.",
        "Hãy cho phép bản thân nghỉ ngơi, đôi khi một tách trà ấm hoặc vài phút đi dạo cũng giúp nhẹ lòng hơn.",
        "Nếu bạn muốn, thử viết ra một điều nhỏ đã làm được hôm nay — nó có thể giúp bạn nhìn nhận khác đi.",
        "Mình ở đây để lắng nghe, bạn không cần phải đối diện mọi chuyện một mình."
      ],
      angry: [
        "Mình cảm nhận được sự bực bội trong lời bạn, điều đó rất thật và hoàn toàn có cơ sở.",
        "Khi tức giận, thử hít thở sâu vài lần, hoặc bước ra ngoài vài phút để làm dịu cơ thể.",
        "Ghi ra điều khiến bạn khó chịu cũng là cách để giải tỏa và tìm hướng xử lý nhẹ nhàng hơn.",
        "Mình sẵn sàng nghe chi tiết nếu bạn muốn trút bầu tâm sự — mình ở đây vì bạn."
      ],
      anxious: [
        "Cảm giác lo lắng có thể làm mọi thứ trở nên nặng nề, và mình hiểu điều đó rất rõ.",
        "Thử hạ nhịp thở: hít 4 giây, thở ra 6 giây, lặp lại vài lần — nó thường giúp ổn định khá nhanh.",
        "Nếu áp lực đến từ một việc cụ thể, chia nhỏ nhiệm vụ thành bước nhỏ cũng giúp bạn thấy dễ chịu hơn.",
        "Mình luôn sẵn lòng đồng hành, bạn có thể nói tiếp để mình cùng suy nghĩ hướng giải quyết."
      ],
      curious: [
        "Câu hỏi hay quá — mình rất vui khi được thảo luận với bạn.",
        "Nếu bạn muốn, mình có thể giải thích rõ hơn, đưa ví dụ hoặc gợi ý từng bước.",
        "Hãy nói rõ hơn một chút để mình hỗ trợ thật cụ thể nhé.",
        "Mình ở đây để đồng hành cùng bạn trong hành trình học hỏi."
      ],
      neutral: [
        "Mình lắng nghe bạn, cảm ơn vì đã chia sẻ những lời vừa rồi.",
        "Nếu bạn muốn, mình có thể gợi ý một vài bước nhỏ để tốt hơn hoặc cùng bạn khám phá cảm xúc đó.",
        "Hãy cho mình biết bạn muốn mình đồng cảm, gợi ý hành động, hay chỉ cần một người lắng nghe.",
        "Mình luôn ở đây, sẵn sàng đồng hành cùng bạn qua những lúc nhẹ nhàng hay khó khăn."
      ]
    };

    // choose 3-5 unique sentences from selected pool (or mix pools if needed)
    const pool = pools[mood] || pools.neutral;
    const count = 3 + Math.floor(Math.random() * 3); // 3..5
    const chosen = [];
    // Ensure variety: shuffle and pick first count
    const copy = pool.slice();
    while (chosen.length < count) {
      if (copy.length === 0) {
        // fallback: add neutral sentence
        copy.push(...pools.neutral);
      }
      const idx = Math.floor(Math.random() * copy.length);
      chosen.push(copy.splice(idx, 1)[0]);
    }

    // join with spaces, friendly tone
    return chosen.join(' ');
  }

  // Send chat message handler
  async function handleSendChat() {
    const text = chatInput.value.trim();
    if (!text) {
      showToast('Gõ gì đó vào ô chat rồi nhấn Gửi nha :)');
      return;
    }

    const mood = detectMood(text);
    const emoji = getMoodEmoji(mood);

    // Append user message with emoji
    appendMessage('you', text, emoji);
    chatInput.value = '';
    setChatStatus('Đang nghĩ...');

    // Save user message to history as pending
    const hist = loadHistoryArray();
    const id = 'chat-' + Date.now();
    const placeholder = {
      id,
      type: 'chat',
      input: text,
      result: null,
      ts: Date.now()
    };
    saveHistoryArray([placeholder].concat(hist));
    renderHistory();

    // Simulate short thinking delay (but produce immediate empathetic reply)
    // Dán khối code mới này vào
try {
  // Gọi đến "bộ não" AI thật sự của OpenAI
  const reply = await getOpenAIResponse(text); 

  // THÊM DÒNG NÀY ĐỂ DEBUG
  console.log('AI Response (Raw):', JSON.stringify(reply));

  // Hiển thị câu trả lời với hiệu ứng gõ phím
  await streamAssistantReply(reply);

  // Cập nhật lịch sử với câu trả lời của AI
  const arr2 = loadHistoryArray();
  const idx = arr2.findIndex(x => x.id === id);
  if (idx !== -1) {
    arr2[idx].result = reply;
    saveHistoryArray(arr2);
    renderHistory();
  }
} catch (error) {
  // Nếu có lỗi xảy ra (VD: sai API key, hết credit, mất mạng)
  console.error('Lỗi khi gọi API:', error);
  appendMessage('assistant', 'Xin lỗi, mình đang gặp sự cố kết nối. Vui lòng thử lại sau.');
} finally {
  // Dù thành công hay thất bại, cuối cùng cũng set status về Ready
  setChatStatus('Ready');
}
// DÁN PHIÊN BẢN MỚI, AN TOÀN NÀY VÀO
async function getOpenAIResponse(userMessage) {
  // URL mới trỏ đến server Python của bạn đang chạy ở cổng 5001
  const API_URL = 'http://127.0.0.1:5000/chat';

  // KHÔNG CÒN API_KEY Ở ĐÂY NỮA!

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Gửi đi tin nhắn của người dùng theo định dạng mà server Python mong muốn
      body: JSON.stringify({ message: userMessage })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Lỗi từ server: ${errorData.error}`);
    }

    const responseData = await response.json();
    // Lấy câu trả lời từ key "reply" mà server Python trả về
    const botReply = responseData.reply;
    return botReply;

  } catch (error) {
    console.error("Không thể gọi đến backend server:", error);
    throw error;
  }
}
  }
// HÀM MỚI ĐỂ LẤY PHÂN TÍCH BIỂU ĐỒ TỪ AI
async function getAIHistoryAnalysis(history) {
  // Xử lý dữ liệu lịch sử thành định dạng đơn giản để gửi đi
  const processedHistory = history.slice(0, 50).reverse().map(item => { // Giới hạn 50 điểm dữ liệu gần nhất
    const topEmotion = (item.emotions && item.emotions[0]?.name) || 'Không xác định';
    return { time: fmtTimeShort(item.ts), emotion: topEmotion };
  });

  try {
    const response = await fetch('http://127.0.0.1:5000/analyze-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: processedHistory })
    });
    if (!response.ok) {
      throw new Error('Lỗi từ server khi AI phân tích.');
    }
    const data = await response.json();
    return data.analysis;
  } catch (error) {
    console.error("Lỗi khi lấy phân tích từ AI:", error);
    throw error;
  }
}
  // A simple "typewriter" display for assistant reply
function streamAssistantReply(fullText) {
  return new Promise(resolve => {
    // Tạo các phần tử DOM như cũ
    const div = document.createElement('div');
    div.className = 'msg';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    metaDiv.textContent = 'Assistant';

    const textDiv = document.createElement('div');
    textDiv.className = 'msg-text';

    div.appendChild(metaDiv);
    div.appendChild(textDiv);
    messagesEl.appendChild(div);

    messagesEl.scrollTop = messagesEl.scrollHeight + 100;

    let i = 0;
    const speed = 12 + Math.floor(Math.random() * 10);
    const timer = setInterval(() => {
      i += 1;
      
      // Lấy đoạn text hiện tại
      const currentText = fullText.slice(0, i);
      
      // **PHẦN NÂNG CẤP BẮT ĐẦU TỪ ĐÂY**
      // 1. Biến đổi các ký tự xuống dòng (\n) thành thẻ <br>
      // 2. Biến đổi markdown in đậm (**text**) thành thẻ <strong>
      const formattedText = currentText
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // 3. Sử dụng innerHTML để hiển thị text đã được định dạng
      textDiv.innerHTML = formattedText;
      // **KẾT THÚC PHẦN NÂNG CẤP**

      messagesEl.scrollTop = messagesEl.scrollHeight + 100;
      if (i >= fullText.length) {
        clearInterval(timer);
        resolve();
      }
    }, speed);
  });
}

  sendChatBtn.addEventListener('click', handleSendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendChat();
    }
  });

  /* ========== Image analysis (client-side heuristics) (KHÔNG THAY ĐỔI) ========== */

  // Image input preview
  imgInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      clearImagePreview();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      imgPreview.innerHTML = `<img src="${url}" alt="preview" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
      imgPreview.dataset.dataurl = url;
      imgResult.textContent = '';
    };
    reader.readAsDataURL(f);
  });

  function clearImagePreview() {
    imgPreview.innerHTML = 'Chưa có ảnh';
    delete imgPreview.dataset.dataurl;
    imgInput.value = '';
    imgResult.textContent = '';
  }
  clearImgBtn.addEventListener('click', () => {
    clearImagePreview();
    showToast('Ảnh đã được xóa khỏi vùng Preview');
  });

  // Analyze image: draw to canvas and compute average luminance & saturation
analyzeImgBtn.addEventListener('click', async () => {
  const url = imgPreview.dataset.dataurl;
  if (!url) {
    showToast('Chưa có ảnh để phân tích');
    return;
  }
  
  imgResult.textContent = 'AI đang phân tích...';
  setChatStatus('Đang phân tích ảnh...');
  actionTipsEl.innerHTML = '<p>AI đang suy nghĩ gợi ý...</p>'; // Thêm trạng thái chờ cho cột trái

  try {
    const response = await fetch('http://127.0.0.1:5000/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: url })
    });

    if (!response.ok) throw new Error('Server AI trả về lỗi.');

    const result = await response.json(); // Nhận về { analysis, emoji, suggestions }
    
    const resultObj = {
      id: 'img-ai-' + Date.now(),
      type: 'image-ai',
      inputName: 'Phân tích ảnh',
      ts: Date.now(),
      result: result.analysis,
      emoji: result.emoji,
      suggestions: result.suggestions // Lưu thêm gợi ý
    };

    displayResult(resultObj); // Hiển thị kết quả ở cột phải
    displayActionTips(resultObj); // HIỂN THỊ GỢI Ý Ở CỘT TRÁI

    imgResult.textContent = '';
    
    const hist = loadHistoryArray();
    saveHistoryArray([resultObj].concat(hist));
    renderHistory();

  } catch (error) {
    console.error(error);
    imgResult.textContent = 'Lỗi phân tích ảnh.';
    actionTipsEl.innerHTML = '<p>Không thể tạo gợi ý do lỗi.</p>';
  } finally {
    setChatStatus('Ready');
  }
});

  // compute average luminance and approximate saturation
  function analyzeImageData(imgData) {
    const data = imgData.data;
    let rAcc = 0, gAcc = 0, bAcc = 0;
    let lumAcc = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rAcc += r; gAcc += g; bAcc += b;
      // luminance formula
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumAcc += lum;
      total += 1;
    }
    const avgR = rAcc / total;
    const avgG = gAcc / total;
    const avgB = bAcc / total;
    const avgLum = lumAcc / total;

    // approximate saturation by mean of (max-min)/max per pixel on sample
    // We'll sample every Nth pixel for speed
    let satSum = 0, satCount = 0;
    const step = 4 * 6; // sample every 6th pixel
    for (let i = 0; i < data.length; i += step) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      satSum += sat;
      satCount += 1;
    }
    const avgSat = satCount ? satSum / satCount : 0;
    return { avgLum, avgSat };
  }

  /* ========== Audio analysis (client-side heuristics) (KHÔNG THAY ĐỔI) ========== */
  audioInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      audioPlayer.style.display = 'none';
      audioPlayer.src = '';
      audioResult.textContent = '';
      return;
    }
    audioPlayer.src = URL.createObjectURL(f);
    audioPlayer.style.display = 'block';
    audioResult.textContent = '';
  });

  clearAudioBtn.addEventListener('click', () => {
    audioInput.value = '';
    audioPlayer.src = '';
    audioPlayer.style.display = 'none';
    audioResult.textContent = '';
    showToast('Audio đã xóa');
  });

analyzeAudioBtn.addEventListener('click', async () => {
  const audioFile = audioInput.files[0];
  if (!audioFile) {
    showToast('Chưa chọn file audio');
    return;
  }

  // Hiển thị trạng thái chờ
  audioResult.textContent = ''; // Xóa sạch chữ trong khu vực audioResult
  setChatStatus('Đang phân tích audio...');
  actionTipsEl.innerHTML = '<p>AI đang suy nghĩ gợi ý...</p>'; // Trạng thái chờ cho cột trái

  const formData = new FormData();
  formData.append('audio_file', audioFile);

  try {
    const response = await fetch('http://127.0.0.1:5000/analyze-audio', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Server AI trả về lỗi.');

    // Nhận về dữ liệu có cấu trúc: { analysis, suggestions, transcription }
    const result = await response.json();

    

    // Tạo đối tượng kết quả để hiển thị và lưu trữ
    const resultObj = {
      id: 'audio-ai-' + Date.now(),
      type: 'audio-ai',
      inputName: 'Phân tích audio',
      ts: Date.now(),
      result: result.analysis,       // Phần phân tích
      emoji: result.emoji,
      suggestions: result.suggestions // Phần gợi ý
    };

    displayResult(resultObj); // Gửi phần phân tích sang cột phải
    displayActionTips(resultObj); // Gửi phần gợi ý sang cột trái
    
    // Lưu vào lịch sử
    const hist = loadHistoryArray();
    saveHistoryArray([resultObj].concat(hist));
    renderHistory();

  } catch (error) {
    console.error(error);
    audioResult.textContent = 'Đã có lỗi xảy ra khi phân tích audio.';
    actionTipsEl.innerHTML = '<p>Không thể tạo gợi ý do lỗi.</p>';
    showToast('Lỗi khi phân tích audio: ' + error.message);
  } finally {
    setChatStatus('Ready');
  }
});

  function computeRMS(samples) {
    let sum = 0;
    const N = samples.length;
    for (let i = 0; i < N; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / N);
  }

  function computeZCR(samples) {
    let z = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) z++;
    }
    return z / samples.length;
  }

  /* ========== Display result & history (KHÔNG THAY ĐỔI) ========= */

  function clearLastResultUI() {
    lastResult.innerHTML = '';
    actionTipsEl.textContent = '';
  }

  // THAY THẾ TOÀN BỘ HÀM displayResult CŨ
// THAY THẾ TOÀN BỘ HÀM displayResult CŨ
function displayResult(resultObj) {
  clearLastResultUI();

  // Hiển thị thẻ icon và tiêu đề ở cột phải
  const nod = document.createElement('div');
  nod.className = 'emotion-card card';
  nod.innerHTML = `
    <div class="emotion-icon">${resultObj.emoji || '🤔'}</div>
    <div class="result-text-content">
      <div class="result-title">Phân Tích Từ AI</div>
      <div class="result-subtitle">${resultObj.inputName}</div>
      <p class="analysis-text">${(resultObj.result || "Không có phân tích.").replace(/\n/g, '<br>')}</p>
    </div>
  `;
  lastResult.appendChild(nod);

  // Hiển thị thông tin chung
  const metaDiv = document.createElement('div');
  metaDiv.className = 'muted small meta-info';
  metaDiv.textContent = `Nguồn: ${resultObj.inputName || 'N/A'} • ${fmtTime(resultObj.ts)}`;
  lastResult.appendChild(metaDiv);
}
  
    // Generate friendly action tips based on result
function displayActionTips(resultObj) {
  // Nếu là chat, vẫn giữ logic cũ
  if (resultObj.type === 'chat') {
      actionTipsEl.innerHTML = `<div>${resultObj.result || ''}</div>`;
      return;
  }
  
  // Nếu là phân tích AI, hiển thị các gợi ý đã nhận về
  const suggestions = resultObj.suggestions || [];
  if (suggestions.length > 0) {
    let tipsHTML = '<ul>';
    suggestions.forEach(tip => {
      tipsHTML += `<li>${tip}</li>`;
    });
    tipsHTML += '</ul>';
    actionTipsEl.innerHTML = tipsHTML;
  } else {
    actionTipsEl.innerHTML = '<p>AI không đưa ra gợi ý nào cho phân tích này.</p>';
  }
}
  /* ========== History rendering (KHÔNG THAY ĐỔI) ========== */
  function renderHistory() {
    const arr = loadHistoryArray();
    historyEl.innerHTML = '';
    if (!arr || arr.length === 0) {
      historyEl.innerHTML = `<div class="muted small">Không có lịch sử.</div>`;
      return;
    }
    for (const it of arr) {
      const item = document.createElement('div');
      item.className = 'card';
      item.style.padding = '8px';
      item.style.cursor = 'pointer';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      const left = document.createElement('div');
      left.innerHTML = `<div style="font-weight:700">${it.type.toUpperCase()} ${it.inputName ? '• ' + it.inputName : ''}</div>
                       <div class="muted small">${it.type === 'chat' ? it.input : (it.emotions && it.emotions[0] ? it.emotions[0].name : '')}</div>`;
      const right = document.createElement('div');
      right.className = 'muted small';
      right.textContent = fmtTime(it.ts);
      item.appendChild(left);
      item.appendChild(right);

      item.addEventListener('click', () => {
        // show the item in lastResult / messages
        if (it.type === 'chat') {
          // show chat in messages: user message + assistant reply
          messagesEl.innerHTML = ''; // Clear messages before showing history
          const userMood = detectMood(it.input || '');
          const userEmoji = getMoodEmoji(userMood);
          appendMessage('you', it.input || '', userEmoji);
          appendMessage('assistant', it.result || generateSoulResponse(it.input || ''));
        } else {
          displayResult(it);
        }
      });

      historyEl.appendChild(item);
    }
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('Xóa toàn bộ lịch sử phân tích? Hành động này không thể hoàn tác.')) return;
    saveHistoryArray([]);
    renderHistory();
    clearLastResultUI();
    showToast('Lịch sử đã được xóa');
  });
/* ========== THÊM MỚI: Logic cho Chat Bubble ========== */

// 1. Logic Mở/Đóng cửa sổ Chat
chatBubble.addEventListener('click', (event) => {
    if (chatBubble.isDragging) {
        chatBubble.isDragging = false;
        return;
    }

    // Tính toán vị trí của cửa sổ chat trước khi hiện
    const bubbleRect = chatBubble.getBoundingClientRect();
    const modalRect = chatModal.getBoundingClientRect();

    // Mặc định căn theo bottom
    chatModal.style.bottom = (window.innerHeight - bubbleRect.bottom) + 'px';

    // Nếu bubble ở nửa trái màn hình -> mở chat bên phải
    if (bubbleRect.left < (window.innerWidth / 2)) {
        chatModal.style.left = (bubbleRect.right + 15) + 'px';
        chatModal.style.right = 'auto';
    } else { // Nếu bubble ở nửa phải màn hình -> mở chat bên trái
        chatModal.style.right = (window.innerWidth - bubbleRect.left + 15) + 'px';
        chatModal.style.left = 'auto';
    }

    chatModal.classList.toggle('visible');
});

// 2. Logic Kéo-Thả (Draggable)
function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  element.onmousedown = dragMouseDown;
  element.isDragging = false; // Biến để kiểm tra xem có đang kéo không

  function dragMouseDown(e) {
    e.preventDefault();
    chatModal.classList.remove('visible');
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  // THÊM MỚI: Tự động đóng cửa sổ chat khi click ra ngoài
window.addEventListener('click', function(e) {
  // Kiểm tra xem cửa sổ chat có đang hiện không
  if (chatModal.classList.contains('visible')) {
    // Nếu điểm click không nằm trong cửa sổ chat VÀ không phải là bong bóng chat
    if (!chatModal.contains(e.target) && !chatBubble.contains(e.target)) {
      // Thì đóng cửa sổ chat
      chatModal.classList.remove('visible');
    }
  }
});

  function elementDrag(e) {
    e.preventDefault();
    element.isDragging = true;
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    let newTop = element.offsetTop - pos2;
    let newLeft = element.offsetLeft - pos1;

    // Giới hạn không cho kéo ra ngoài màn hình
    const screenPadding = 10;
    newTop = Math.max(screenPadding, Math.min(newTop, window.innerHeight - element.offsetHeight - screenPadding));
    newLeft = Math.max(screenPadding, Math.min(newLeft, window.innerWidth - element.offsetWidth - screenPadding));

    element.style.top = newTop + "px";
    element.style.left = newLeft + "px";
  }

 function closeDragElement() {
  document.onmouseup = null;
  document.onmousemove = null;

  // Logic bám vào cạnh màn hình
  const bubbleCenter = element.offsetLeft + element.offsetWidth / 2;
  if (bubbleCenter < window.innerWidth / 2) {
    // Bám vào cạnh trái
    element.style.left = "20px";
  } else {
    // Bám vào cạnh phải
    element.style.left = (window.innerWidth - element.offsetWidth - 20) + "px";
  }

  setTimeout(() => {
      element.isDragging = false;
  }, 0);
}
}
// THÊM MỚI: Tự động đóng cửa sổ chat khi click ra ngoài
window.addEventListener('click', function(e) {
  // Chỉ kiểm tra nếu cửa sổ chat đang được hiển thị
  if (chatModal.classList.contains('visible')) {
    
    // Nếu vị trí click nằm ngoài cửa sổ chat VÀ cũng nằm ngoài bong bóng chat
    if (!chatModal.contains(e.target) && !chatBubble.contains(e.target)) {
      
      // Thì ẩn cửa sổ chat đi
      chatModal.classList.remove('visible');
    }
  }
});
  /* ========== Initialization (KHÔNG THAY ĐỔI) ========== */
  function init() {
    setChatStatus('Ready');
    renderHistory();
    // If messages area empty, show a friendly prompt
    if (messagesEl.children.length === 0) {
      appendMessage('assistant', 'Chào bạn! Mình là SoulLens (demo). Gõ vài dòng để mình lắng nghe nhé — mình sẽ trả lời bằng những lời thân thiện, như một người bạn đồng hành.');
    }
    
 }   
// Tự động hiện tin nhắn chào mừng sau 1.5 giây
    setTimeout(() => {
      const bubbleRect = chatBubble.getBoundingClientRect();
      
      // Tính toán vị trí cho tin nhắn
      welcomeToast.style.top = (bubbleRect.top + (bubbleRect.height / 2) - 18) + 'px';

      // Quyết định hiện tin nhắn bên trái hay phải của bubble
      if (bubbleRect.left < (window.innerWidth / 2)) { // Bubble bên trái -> tin nhắn hiện bên phải
        welcomeToast.style.left = (bubbleRect.right + 15) + 'px';
        welcomeToast.style.right = 'auto';
        
        // SỬA LỖI: Đuôi phải chỉ sang trái -> dùng class on-right
        welcomeToast.classList.add('on-right');
        welcomeToast.classList.remove('on-left');
      } else { // Bubble bên phải -> tin nhắn hiện bên trái
        // Chỗ này cần tính toán lại 1 chút để không bị tràn màn hình
        welcomeToast.style.left = (bubbleRect.left - welcomeToast.offsetWidth - 15) + 'px';
        welcomeToast.style.right = 'auto';

        // SỬA LỖI: Đuôi phải chỉ sang phải -> dùng class on-left
        welcomeToast.classList.add('on-left');
        welcomeToast.classList.remove('on-right');
      }

      welcomeToast.classList.add('visible');
      
      // Tự động ẩn đi sau 5 giây
      setTimeout(() => {
        welcomeToast.classList.remove('visible');
      }, 5000);

    }, 1500);
  init();

  // Expose a few helpers to global for debug if needed
  window.soullens = {
    generateSoulResponse,
    analyzeImageData,
    computeRMS,
    computeZCR,
    loadHistoryArray,
    saveHistoryArray
  };

})();