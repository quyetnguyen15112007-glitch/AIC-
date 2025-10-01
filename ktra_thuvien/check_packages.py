import importlib
import subprocess
import sys

# Danh sách thư viện cần
packages = {
    "speechrecognition": "speech_recognition",
    "pyaudio": "pyaudio",
    "librosa": "librosa",
    "soundfile": "soundfile",
    "numpy": "numpy",
    "torch": "torch",
    "torchaudio": "torchaudio",
}

for pip_name, import_name in packages.items():
    try:
        importlib.import_module(import_name)
        print(f"✅ {pip_name} đã được cài")
    except ImportError:
        print(f"❌ {pip_name} chưa cài → tiến hành cài đặt...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])

print("\n🎉 Kiểm tra hoàn tất!")
