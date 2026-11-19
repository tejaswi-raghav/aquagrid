FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY dist ./dist
RUN useradd --uid 10001 --create-home aquagrid && mkdir /app/data && chown aquagrid /app/data
USER aquagrid
ENV AQUAGRID_DB=/app/data/aquagrid.sqlite
EXPOSE 8000
CMD ["uvicorn", "backend.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
