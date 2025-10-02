# Sử dụng một ảnh Docker có sẵn Miniconda làm nền
FROM continuumio/miniconda3

# Đặt thư mục làm việc bên trong container là /app
WORKDIR /app

# Chép file environment.yml vào trong container
COPY environment.yml .

# Dùng file environment.yml để tạo lại môi trường aic_env
# Quá trình này có thể mất khá nhiều thời gian
RUN conda env create -f environment.yml

# Chép toàn bộ code còn lại của dự án vào container
COPY . .

# Bảo Docker rằng các lệnh sau này phải được chạy bên trong môi trường aic_env
SHELL ["conda", "run", "-n", "aic_env", "/bin/bash", "-c"]

# Lệnh để khởi động web server của bạn khi container chạy
# Flask thường chạy ở cổng 5000, Render cần nó chạy ở cổng 10000
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "10000"]