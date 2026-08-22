/**
 * Talking to Yandex's geocoder — **now `@amragrir/shared/geocoder`**.
 *
 * It moved there on 2026-08-11, when the phone's picker stopped using the
 * device's geocoder and started asking the API for addresses instead. Two
 * servers now hold the same key and must build the same request: this app's
 * `GET /[lang]/geocode` route and the API's `GET /geocode`. The language codes,
 * the coordinate order and the shape of an answer are one fact, written once.
 *
 * This module stays as the web's name for it — the route and the tests here
 * import from `@/lib/geocode` — and adds nothing of its own.
 */
export { MAX_RESULTS, geocoderUrl, queryLang, readPlaces, yandexLang } from '@amragrir/shared';
