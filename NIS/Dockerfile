FROM python:3.12

# Клиент Docker нужен для проверки задач на код: решение запускается
# соседним контейнером через сокет хоста, смонтированный в compose.
# Ставим только клиент — демон берём хостовый.
ARG DOCKER_CLI_VERSION=27.3.1
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
    | tar -xz -C /tmp docker/docker \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker

WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
