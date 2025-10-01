# cam_ai_realtimetracking.py
import cv2
import time
import math
import os
import sys
import glob
import re
import unicodedata
import numpy as np
from deepface import DeepFace
from PIL import ImageFont, ImageDraw, Image

# --- Cấu hình ---
INITIAL_ANALYSIS_DELAY = 3.0
# THAY ĐỔI: Giảm thời gian lặp lại phân tích xuống 2.5 giây
REPEAT_ANALYSIS_DELAY = 2.5

# --- Các phần helper (không thay đổi) ---
FONT_CANDIDATES = [
    "NotoSans-Regular.ttf", "NotoSansVN-Regular.ttf", "DejaVuSans.ttf", "Arial.ttf",
    "Tahoma.ttf", "SegoeUI.ttf", "Times New Roman.ttf", "Verdana.ttf", "FreeSans.ttf"
]
SYSTEM_FONT_DIRS = []
if sys.platform.startswith("win"):
    SYSTEM_FONT_DIRS = [r"C:\Windows\Fonts"]
elif sys.platform.startswith("darwin"):
    SYSTEM_FONT_DIRS = ["/Library/Fonts", "/System/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
else:
    SYSTEM_FONT_DIRS = ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts"), "/usr/share/fonts/truetype"]

emotions_map = {
    "happy": "Vui vẻ", "sad": "Buồn", "angry": "Tức giận",
    "surprise": "Ngạc nhiên", "fear": "Lo lắng", "neutral": "Bình tĩnh",
    "disgust": "Ghê tởm"
}

def find_font_file():
    cwd = os.getcwd()
    for name in FONT_CANDIDATES:
        p = os.path.join(cwd, name)
        if os.path.isfile(p): return p
    for font_dir in SYSTEM_FONT_DIRS:
        for name in FONT_CANDIDATES:
            pattern = os.path.join(font_dir, "**", "*" + os.path.splitext(name)[0] + "*")
            matches = glob.glob(pattern, recursive=True)
            if matches:
                for m in matches:
                    if m.lower().endswith((".ttf", ".otf")): return m
    for font_dir in SYSTEM_FONT_DIRS:
        matches = glob.glob(os.path.join(font_dir, "**", "*.ttf"), recursive=True)
        if matches: return matches[0]
    return None

EMOJI_PATTERN = re.compile("["
    u"\U0001F600-\U0001F64F" u"\U0001F300-\U0001F5FF" u"\U0001F680-\U0001F6FF"
    u"\U0001F1E0-\U0001F1FF" u"\U00002700-\U000027BF" u"\U000024C2-\U0001F251"
    "]+", flags=re.UNICODE)
def remove_emojis(text): return EMOJI_PATTERN.sub('', text)
def remove_diacritics(text):
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join([c for c in nfkd if not unicodedata.combining(c)])

class TextDrawer:
    def __init__(self):
        self.font_path = find_font_file()
        if self.font_path:
            try:
                _ = ImageFont.truetype(self.font_path, 20)
                print("Using font file:", self.font_path)
            except Exception as e:
                print("Found font file but cannot load it:", e)
                self.font_path = None
        else:
            print("No TTF font file found, fallback to no-diacritics mode.")
    def draw(self, frame, text, pos, font_size=24, color=(0,255,0)):
        text = remove_emojis(text)
        if self.font_path:
            try:
                img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                draw = ImageDraw.Draw(img_pil)
                font = ImageFont.truetype(self.font_path, font_size)
                draw.text(pos, text, font=font, fill=color)
                return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
            except Exception as e: print("PIL draw error:", e)
        text_ascii = remove_diacritics(text)
        scale = max(0.5, font_size / 40.0)
        cv2.putText(frame, text_ascii, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2, cv2.LINE_AA)
        return frame

def draw_face_icon(frame, top_left, size, emotion):
    x, y = top_left
    cx, cy = x + size//2, y + size//2
    radius = size // 2
    colors = {
        "happy": (0, 200, 255), "sad": (255, 100, 100), "angry": (30, 30, 200),
        "neutral": (200, 200, 200), "surprise": (180, 180, 255), "fear": (160, 90, 200),
        "disgust": (50, 150, 50)
    }
    color = colors.get(emotion, (200,200,200))
    cv2.circle(frame, (cx, cy), radius, color, -1, lineType=cv2.LINE_AA)
    cv2.circle(frame, (cx, cy), radius, (50,50,50), 2, lineType=cv2.LINE_AA)
    eye_y, eye_dx, eye_r = cy - size//6, size//6, max(2, size//15)
    cv2.circle(frame, (cx - eye_dx, eye_y), eye_r, (10,10,10), -1, lineType=cv2.LINE_AA)
    cv2.circle(frame, (cx + eye_dx, eye_y), eye_r, (10,10,10), -1, lineType=cv2.LINE_AA)
    mouth_y, mouth_w, mouth_h = cy + size//8, size//3, size//6
    if emotion == "happy": cv2.ellipse(frame, (cx, mouth_y), (mouth_w, mouth_h//2), 0, 0, 180, (10,10,10), 4, lineType=cv2.LINE_AA)
    elif emotion == "sad": cv2.ellipse(frame, (cx, mouth_y + size//10), (mouth_w, mouth_h//2), 0, 180, 360, (10,10,10), 4, lineType=cv2.LINE_AA)
    elif emotion == "angry":
        cv2.line(frame, (cx - mouth_w//2, mouth_y), (cx + mouth_w//2, mouth_y), (10,10,10), 4, lineType=cv2.LINE_AA)
        cv2.line(frame, (cx - eye_dx-12, eye_y-18), (cx-eye_dx+10, eye_y-8), (10,10,10), 3, lineType=cv2.LINE_AA)
        cv2.line(frame, (cx + eye_dx+12, eye_y-18), (cx+eye_dx-10, eye_y-8), (10,10,10), 3, lineType=cv2.LINE_AA)
    elif emotion == "surprise": cv2.ellipse(frame, (cx, mouth_y + mouth_h//4), (mouth_w//2, mouth_h//2), 0, 0, 360, (10,10,10), -1, lineType=cv2.LINE_AA)
    else: cv2.line(frame, (cx - mouth_w//2, mouth_y), (cx + mouth_w//2, mouth_y), (10,10,10), 4, lineType=cv2.LINE_AA)

def draw_loading_dot(frame, center, radius, angle):
    x = int(center[0] + radius * math.cos(angle))
    y = int(center[1] + radius * math.sin(angle))
    cv2.circle(frame, (x, y), 6, (0, 255, 255), -1, lineType=cv2.LINE_AA)

def show_animated_welcome_screen(drawer, duration=4.0):
    WIDTH, HEIGHT = 900, 400
    start_time = time.time()
    
    gradient = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
    start_color = np.array([30, 10, 0])
    end_color = np.array([0, 0, 0])
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        color = (start_color * (1 - ratio) + end_color * ratio).astype(np.uint8)
        gradient[y, :] = color

    angle = 0
    while time.time() - start_time < duration:
        frame = gradient.copy()
        
        frame = drawer.draw(frame, "AI Camera - Emotion Tracking", (120, 80), font_size=40, color=(50, 255, 50))
        
        progress = (time.time() - start_time) / duration
        
        num_dots = 8
        center_pos = (WIDTH // 2, HEIGHT // 2 + 50)
        for i in range(num_dots):
            dot_angle = angle + (2 * math.pi * i / num_dots)
            alpha = 0.5 * (math.sin(dot_angle*2) + 1) 
            color = (int(alpha*0), int(alpha*255), int(alpha*255))
            x = int(center_pos[0] + 50 * math.cos(dot_angle))
            y = int(center_pos[1] + 50 * math.sin(dot_angle))
            cv2.circle(frame, (x, y), 5, color, -1, cv2.LINE_AA)
        angle += 0.08

        frame = drawer.draw(frame, "Đang khởi tạo các mô hình AI...", (center_pos[0]-180, center_pos[1]-15), font_size=20, color=(200, 200, 200))
        
        bar_y, bar_h = HEIGHT - 80, 20
        bar_width = WIDTH - 200
        cv2.rectangle(frame, (100, bar_y), (100 + bar_width, bar_y + bar_h), (50, 50, 50), -1)
        current_width = int(bar_width * progress)
        cv2.rectangle(frame, (100, bar_y), (100 + current_width, bar_y + bar_h), (50, 255, 50), -1)
        
        cv2.imshow("AI Camera Welcome", frame)
        if cv2.waitKey(15) & 0xFF == ord('q'):
            break
            
    cv2.destroyAllWindows()


# --- Main ---
def main():
    print("Lần chạy đầu tiên có thể mất một lúc để tải các mô hình AI...")
    drawer = TextDrawer()

    show_animated_welcome_screen(drawer)
    
    cascade_path = 'haarcascade_frontalface_default.xml'
    if not os.path.exists(cascade_path):
        print(f"LỖI: Không tìm thấy file '{cascade_path}'.")
        print("Vui lòng tải file và đặt vào cùng thư mục với script.")
        return
    face_cascade = cv2.CascadeClassifier(cascade_path)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Không mở được camera.")
        return

    next_analysis = time.time() + INITIAL_ANALYSIS_DELAY
    current_emotion = None
    last_result_time = None
    angle = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        h, w = frame.shape[:2]
        now = time.time()

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(50, 50)
        )
        
        for (x, y, w_box, h_box) in faces:
            cv2.rectangle(frame, (x, y), (x + w_box, y + h_box), (0, 255, 0), 2)

        if now >= next_analysis:
            start_load = time.time()
            while time.time() - start_load < 0.6:
                temp = frame.copy()
                draw_loading_dot(temp, (w//2, h//2), min(w,h)//6, angle)
                angle += 0.5
                cv2.imshow("AI Camera", temp)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    return
            try:
                results = DeepFace.analyze(
                    frame, 
                    actions=['emotion'], 
                    enforce_detection=False,
                    detector_backend='mtcnn' 
                )
                
                if results and isinstance(results, list) and results[0]:
                    current_emotion = results[0].get('dominant_emotion')
                    last_result_time = time.time()
                else:
                    current_emotion = None
            except Exception as e:
                print("Lỗi khi phân tích cảm xúc:", e)
                current_emotion = None
            next_analysis = time.time() + REPEAT_ANALYSIS_DELAY
        
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (360, 150), (0,0,0), -1)
        alpha = 0.6
        frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

        if last_result_time:
            elapsed = int(time.time() - last_result_time)
            txt_time = f"Đã phân tích: {elapsed}s trước"
        else:
            txt_time = "Chưa phân tích"
        frame = drawer.draw(frame, txt_time, pos=(20, 40), font_size=18, color=(255,255,255))

        if current_emotion in emotions_map:
            frame = drawer.draw(frame, f"Tình trạng: {emotions_map[current_emotion]}", pos=(20, 80), font_size=22, color=(0,255,0))
            face_size = 120
            top_left = (w - face_size - 20, 20)
            draw_face_icon(frame, top_left, face_size, current_emotion)
        else:
            frame = drawer.draw(frame, "Tình trạng: -", pos=(20, 80), font_size=22, color=(200,200,200))

        # Dùng math.ceil để làm tròn lên, giúp hiển thị trực quan hơn
        wait_seconds = max(0, math.ceil(next_analysis - time.time()))
        frame = drawer.draw(frame, f"Phân tích kế tiếp sau: {wait_seconds}s", pos=(20, 115), font_size=16, color=(200,200,200))

        cv2.imshow("AI Camera", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()