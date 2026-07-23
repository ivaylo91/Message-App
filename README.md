# Message App

Enterprise-grade mobile messaging app.

## Stack

- **Mobile:** React Native ([mobile/](mobile/))
- **Backend:** NestJS + TypeScript ([backend/](backend/))
- **Real-time transport:** MQTT (EMQX broker)
- **Data:** PostgreSQL (durable storage), Redis (presence, pub/sub)
- **Event streaming:** Kafka (delivery guarantees, fan-out, audit logging) — brought up later, not required for the initial chat flow
- **Push notifications:** FCM (Android) / APNs (iOS)
- **Auth:** OIDC/OAuth2 (Keycloak or Auth0)
- **E2EE:** Signal Protocol (libsignal), if/when required

## Layout

```
mobile/    React Native app
backend/   NestJS API + MQTT integration
infra/     docker-compose for local dependencies
```

## Local development

Start core infra (Postgres, Redis, EMQX):

```
cd infra
docker compose up -d
```

(If your `docker` CLI doesn't have the `compose` plugin, use the standalone
`docker-compose` binary instead, e.g. `docker-compose up -d`.)

Bring up Kafka too (only needed once you're wiring fan-out/streaming):

```
docker compose --profile kafka up -d
```

EMQX dashboard: http://localhost:18083 (default admin/public)

### Backend

```
cd backend
npm install
npx prisma migrate dev   # first time only, applies the schema
npm run start:dev
```

### Mobile

```
cd mobile
npm install
npx react-native run-android   # or run-ios
```
