# The Go API image.
#
# Two stages: the module is built with the toolchain that matches `go.mod`,
# and the runtime image carries the binary, the route manifest and CA
# certificates — nothing else. There is no PHP, no web server and no queue
# worker: the gateway is one process, and the database is external.

FROM golang:1.27-alpine AS build

WORKDIR /src

# Cache the module download separately from the source.
COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

# GOEXPERIMENT=nojsonv2: the wire contract is PHP-compatible JSON, and Go
# 1.27's encoding/json/v2 may encode differently (AGENTS.md trap 1).
RUN GOEXPERIMENT=nojsonv2 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata wget && \
    adduser -D -H -u 10001 app

WORKDIR /app

COPY --from=build /out/gateway /app/gateway
COPY routing/routes.yaml /app/routing/routes.yaml

RUN chown -R app:app /app

ENV TZ=UTC
EXPOSE 8080

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/app/gateway", "--addr=:8080"]
