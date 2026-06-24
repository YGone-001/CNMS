# xCloud Monitor - Multi-stage Docker Build
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --production=false

COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./

# Copy frontend dist into backend for embedding
COPY --from=frontend-builder /app/frontend/dist/ ./public/dist/

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /xcloud-monitor .

# Stage 3: Final image
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary
COPY --from=backend-builder /xcloud-monitor .

# Copy default config
COPY backend/config/config.json ./config/config.json

# Create log directory
RUN mkdir -p /var/log/xCloud

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

# Run
ENTRYPOINT ["./xcloud-monitor"]
CMD ["-config", "config/config.json"]
