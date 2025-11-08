FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose backend port (e.g. 5000)
EXPOSE 5006

CMD ["node", "index.js"]
