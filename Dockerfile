FROM node:20-slim

# Prisma needs openssl at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY frontend/ ./
RUN npm install
RUN npm run build

CMD ["sh", "-c", "npx next start -p $PORT"]
