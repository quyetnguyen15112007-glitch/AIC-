import os
import base64
import cv2
import numpy as np
from deepface import DeepFace
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI  # THÊM MỚI
from dotenv import load_dotenv # THÊM MỚI

# --- PHẦN THIẾT LẬP MỚI CHO CHATGPT ---
# Tải các biến môi trường từ file .env (chứa OPENAI_API_KEY)
load_dotenv()

# Khởi tạo Flask app và cho phép Cross-Origin Resource Sharing (CORS)
app = Flask(__name__)
CORS(app)

# Khởi tạo OpenAI client, API key sẽ được tự động đọc từ biến môi trường
try:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    print("OpenAI client đã được khởi tạo thành công.")
except Exception as e:
    print(f"Lỗi: Không thể khởi tạo OpenAI client. Lỗi chi tiết: {e}")
    client = None
# --- KẾT THÚC PHẦN THIẾT LẬP MỚI ---


# --- PHẦN API PHÂN TÍCH ẢNH (GIỮ NGUYÊN) ---
emotions_map = {
    "happy": "Vui vẻ", "sad": "Buồn", "angry": "Tức giận",
    "surprise": "Ngạc nhiên", "fear": "Lo lắng", "neutral": "Bình tĩnh",
    "disgust": "Ghê tởm"
}

@app.route('/analyze', methods=['POST'])
def analyze_emotion():
    data = request.json
    if not data or 'image' not in data:
        return jsonify({'error': 'Không có dữ liệu ảnh'}), 400

    image_data = data['image'].split(',')[1]
    decoded_data = base64.b64decode(image_data)
    np_arr = np.frombuffer(decoded_data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    try:
        results = DeepFace.analyze(
            frame,
            actions=['emotion'],
            enforce_detection=False,
            detector_backend='mtcnn'
        )

        if results and isinstance(results, list) and results[0]:
            dominant_emotion_en = results[0].get('dominant_emotion')
            dominant_emotion_vi = emotions_map.get(dominant_emotion_en, "Không xác định")
            return jsonify({
                'emotion_en': dominant_emotion_en,
                'emotion_vi': dominant_emotion_vi
            })
        else:
            return jsonify({'emotion_vi': 'Không tìm thấy khuôn mặt'})

    except Exception as e:
        print(f"Lỗi khi phân tích: {e}")
        return jsonify({'error': str(e)}), 500

# --- PHẦN API CHAT VỚI GPT (THÊM MỚI) ---
# SỬA LẠI HÀM /chat TRONG server.py

# 1. Tạo một biến toàn cục để lưu trữ lịch sử hội thoại (trí nhớ của chatbot)
#    Chúng ta thêm cả "system prompt" vào đầu để định hình tính cách cho AI
conversation_history = [
    {
        "role": "system",
        "content": "Bạn là SoulLens, một trợ lý AI đồng cảm và thấu hiểu. Hãy trả lời một cách ngắn gọn, ấm áp và luôn đưa ra những gợi ý tích cực. Sử dụng tiếng Việt."
    }
]

@app.route('/chat', methods=['POST'])
def chat():
    global conversation_history # Sử dụng biến toàn cục
    try:
        data = request.json
        user_message = data.get('message')
        if not user_message:
            return jsonify({"error": "Không có tin nhắn"}), 400

        # 2. Thêm tin nhắn mới của người dùng vào lịch sử
        conversation_history.append({"role": "user", "content": user_message})
        
        # Giới hạn để "trí nhớ" không quá dài (tiết kiệm chi phí và tài nguyên)
        if len(conversation_history) > 15:
            # Giữ lại tin nhắn hệ thống và 14 tin nhắn gần nhất
            conversation_history = [conversation_history[0]] + conversation_history[-14:]

        # 3. Gửi TOÀN BỘ lịch sử hội thoại cho OpenAI
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=conversation_history # Gửi cả cuộc hội thoại
        )
        
        ai_response = response.choices[0].message.content
        
        # 4. Thêm câu trả lời của AI vào lịch sử để nó nhớ cho lần sau
        conversation_history.append({"role": "assistant", "content": ai_response})

        return jsonify({"reply": ai_response})
    
    except Exception as e:
        print(f"Lỗi khi chat: {e}")
        return jsonify({"error": "Lỗi khi giao tiếp với AI."}), 500
    # DÁN HÀM MỚI NÀY VÀO CUỐI FILE SERVER.PY
@app.route('/analyze-history', methods=['POST'])
def analyze_history():
    # Lấy dữ liệu lịch sử từ frontend gửi lên
    history_data = request.json.get('history')
    if not history_data or len(history_data) < 3: # Cần ít nhất 3 điểm dữ liệu
        return jsonify({"analysis": "Chưa đủ dữ liệu để AI phân tích."})

    # Chuyển dữ liệu thành một chuỗi văn bản đơn giản để AI dễ đọc
    data_summary = ""
    for item in history_data:
        data_summary += f"- Vào lúc {item['time']}, cảm xúc ghi nhận là: {item['emotion']}\n"

    # Đây là phần quan trọng nhất: "Prompt Engineering"
    # Chúng ta ra lệnh cho AI phải đóng vai gì, phân tích gì và theo cấu trúc nào.
    system_prompt = """
    Bạn là một chuyên gia tâm lý AI, có khả năng phân tích sâu sắc và đưa ra lời khuyên hữu ích, đồng cảm.
    Nhiệm vụ của bạn là phân tích chuỗi dữ liệu cảm xúc của người dùng theo thời gian và đưa ra các nhận định, gợi ý cụ thể.
    Hãy trả lời bằng tiếng Việt, sử dụng văn phong gần gũi, ấm áp.
    """
    user_prompt = f"""
    Dưới đây là lịch sử cảm xúc của tôi được ghi nhận gần đây:
    {data_summary}

    Dựa vào dữ liệu trên, hãy cung cấp một bài phân tích ngắn gọn theo đúng cấu trúc 3 phần sau:
    1.  **Tổng Quan:** Một đoạn (2-3 câu) nhận xét về trạng thái cảm xúc chung (tích cực, tiêu cực, cân bằng, hay biến động?).
    2.  **Điểm Cần Chú Ý:** Chỉ ra một hoặc hai cảm xúc nổi bật hoặc một xu hướng đáng chú ý (ví dụ: "AI nhận thấy cảm xúc 'Buồn' xuất hiện khá thường xuyên..." hoặc "Có vẻ như tâm trạng của bạn đang tốt dần lên...").
    3.  **Gợi Ý Từ AI:** Đưa ra 1-2 gợi ý cụ thể, thực tế, mang tính hành động để giúp tôi cải thiện hoặc duy trì trạng thái tinh thần.
    """

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        ai_analysis = completion.choices[0].message.content
        return jsonify({"analysis": ai_analysis})
    except Exception as e:
        print(f"Lỗi khi phân tích lịch sử: {e}")
        return jsonify({"error": "Lỗi khi giao tiếp với AI để phân tích."}), 500

# 1. ENDPOINT MỚI ĐỂ PHÂN TÍCH HÌNH ẢNH BẰNG AI
@app.route('/analyze-image', methods=['POST'])
def analyze_image_ai():
    image_data_url = request.json.get('image')
    if not image_data_url:
        return jsonify({"error": "Không có dữ liệu ảnh."}), 400

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    # YÊU CẦU AI TRẢ VỀ CẤU TRÚC 3 PHẦN
                    "content": """
                    Bạn là một chuyên gia tâm lý tinh tế. Phân tích hình ảnh, sau đó trả về một đối tượng JSON hợp lệ có ba khóa:
                    1. 'analysis': (string) Chứa bài phân tích sâu sắc về tâm trạng, cảm xúc của hình ảnh bằng tiếng Việt.
                    2. 'emoji': (string) Chứa một emoji duy nhất thể hiện cảm xúc chính của ảnh.
                    3. 'suggestions': (array of strings) Chứa 2-3 câu gợi ý hành động ngắn gọn, hữu ích bằng tiếng Việt.
                    """
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Hãy phân tích hình ảnh này và trả về kết quả dưới dạng JSON theo yêu cầu."},
                        {"type": "image_url", "image_url": {"url": image_data_url}}
                    ],
                }
            ],
            max_tokens=400,
        )
        import json
        ai_response = json.loads(response.choices[0].message.content)
        # Sẽ trả về dạng { "analysis": "...", "emoji": "😊", "suggestions": ["...", "..."] }
        return jsonify(ai_response)
    except Exception as e:
        print(f"Lỗi khi phân tích ảnh bằng AI: {e}")
        return jsonify({"error": "Lỗi khi giao tiếp với AI Vision."}), 500

# 2. ENDPOINT MỚI ĐỂ PHÂN TÍCH ÂM THANH BẰNG AI
@app.route('/analyze-audio', methods=['POST'])
def analyze_audio():
    if 'audio_file' not in request.files:
        return jsonify({"error": "Không có file audio"}), 400
    
    audio_file = request.files['audio_file']
    if audio_file.filename == '':
        return jsonify({"error": "Chưa chọn file"}), 400

    try:
        # Bước 1: Dùng Whisper API để chuyển giọng nói thành văn bản
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio_file.filename, audio_file.stream.read())
        )
        transcript_text = transcription.text

        # Bước 2: Dùng GPT-4o mini để phân tích văn bản đã chuyển đổi
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            # Yêu cầu AI trả về định dạng JSON
            response_format={"type": "json_object"}, 
            messages=[
                {
                    "role": "system",
                    # THAY ĐỔI PROMPT ĐỂ YÊU CẦU CẤU TRÚC MỚI
                    "content": """
                    Bạn là một chuyên gia tâm lý. Dựa vào đoạn văn bản được phiên âm từ giọng nói, hãy trả về một đối tượng JSON hợp lệ có bốn khóa:
                    1. 'analysis': (string) Chứa bài phân tích sâu sắc về tâm trạng, cảm xúc của người nói bằng tiếng Việt.
                    2. 'suggestions': (array of strings) Chứa 2-3 câu gợi ý hành động ngắn gọn, hữu ích bằng tiếng Việt.
                    3. 'transcription': (string) Chứa lại chính xác đoạn văn bản gốc đã được phiên âm.
                    4. 'emoji': (string) Chứa một emoji duy nhất thể hiện cảm xúc chính của văn bản.
                    """
                },
                {
                    "role": "user",
                    "content": f"Hãy phân tích đoạn văn bản sau và trả về kết quả dưới dạng JSON: \"{transcript_text}\""
                }
            ]
        )
        
        # Tải kết quả JSON từ chuỗi trả về của AI
        import json
        ai_response = json.loads(response.choices[0].message.content)
        return jsonify(ai_response) # Trả về { "analysis": "...", "suggestions": [...], "transcription": "..."}
        
    except Exception as e:
        print(f"Lỗi khi phân tích audio bằng AI: {e}")
        return jsonify({"error": "Lỗi khi giao tiếp với AI."}), 500

# --- PHẦN KHỞI CHẠY SERVER ---
if __name__ == '__main__':
    print("Đang khởi tạo các mô hình AI...")
    try:
        dummy_image = np.zeros((100, 100, 3), dtype=np.uint8)
        DeepFace.analyze(dummy_image, actions=['emotion'], enforce_detection=False)
        print("Mô hình DeepFace đã sẵn sàng.")
    except Exception as e:
        print(f"Lỗi khi khởi tạo mô hình DeepFace: {e}")
    
    # Server sẽ chạy trên cổng 5000 và cung cấp cả 2 API (/analyze và /chat)
    print("Bắt đầu chạy máy chủ tại http://12.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000)