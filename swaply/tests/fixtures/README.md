`changenow-currencies.json` and `swapzone-currencies.json` are trimmed copies of real responses from
`GET https://api.changenow.io/v2/exchange/currencies?active=true&flow=standard` and
`GET https://api.swapzone.io/v1/exchange/currencies`, captured on 2026-11-23. They are used so adapter
tests run against the partners' actual response shapes. All other mocked responses follow the field names
of the official docs (see API_INTEGRATIONS.md).
