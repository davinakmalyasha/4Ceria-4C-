# The Go API image.
#
# Two stages: build with the toolchain from go.mod, then run a single static
# binary with the route manifest, CA certificates and a writable upload
# directory. There is no PHP, no web server and no queue worker.

FROM golang:1.27-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata wget && \
    adduser -D -H -u 10001 app

WORKDIR /app

COPY --from=build /out/gateway /app/gateway
COPY routing/routes.yaml /app/routing/routes.yaml

RUN mkdir -p /app/storage/app/public /app/storage/app/private && \
    chown -R app:app /app

ENV TZ=UTC \
    PUBLIC_STORAGE_ROOT=/app/storage/app/public \
    EVIDENCE_DIR=/app/storage/app/private

EXPOSE 8080

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/app/gateway", "--addr=:8080"]
