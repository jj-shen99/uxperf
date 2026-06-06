# @uxperf/rum-sdk

Lightweight Real User Monitoring SDK for collecting **Core Web Vitals** (LCP, FCP, INP, CLS, TTFB), navigation timings, and custom journey metrics. Beacons are sent via `navigator.sendBeacon` for maximum reliability.

## Install

```bash
npm install @uxperf/rum-sdk
```

## Quick Start

```ts
import { initRum } from '@uxperf/rum-sdk';

initRum({
  endpoint: 'https://perf.example.com/api/intelligence/rum/ingest',
  projectId: 'my-project-id',
  sampleRate: 0.1,       // 10% of sessions
  buildHash: 'abc123',   // optional deploy tag
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | *required* | RUM ingestion endpoint URL |
| `projectId` | `string` | *required* | Project ID to tag beacons |
| `sampleRate` | `number` | `1.0` | Sampling rate (0–1) |
| `sessionId` | `string` | auto | Session ID override |
| `buildHash` | `string` | — | Build hash for deploy tracking |
| `featureFlags` | `Record<string, string>` | — | Feature flag labels |
| `labels` | `Record<string, string>` | — | Custom labels per beacon |
| `collectCustomMetrics` | `boolean` | `true` | Collect `performance.measure()` entries |
| `batchInterval` | `number` | `5000` | Flush interval (ms) |
| `maxQueueSize` | `number` | `10` | Force-flush threshold |
| `debug` | `boolean` | `false` | Log to console |

## SPA Route Changes

For single-page applications, call `sendBeacon()` on route transitions:

```ts
import { sendBeacon } from '@uxperf/rum-sdk';

router.afterEach(() => {
  sendBeacon();
});
```

## Custom Journey Metrics

Track user-defined journeys with `rumMark`:

```ts
import { rumMark } from '@uxperf/rum-sdk';

const end = rumMark('checkout-flow');
// ... user completes checkout ...
end(); // creates performance.measure('checkout-flow', ...)
```

Or use the standard Performance API directly:

```ts
performance.mark('cart-start');
// ... user interaction ...
performance.mark('cart-confirmed');
performance.measure('time-to-cart-confirmation', 'cart-start', 'cart-confirmed');
```

The SDK automatically picks up `performance.measure()` entries and includes them in the next beacon.

## API

| Export | Description |
|--------|-------------|
| `initRum(config)` | Initialize the SDK and start collecting vitals |
| `sendBeacon(overrides?)` | Manually queue a beacon (e.g., on SPA route change) |
| `flush()` | Force-flush the beacon queue |
| `destroyRum()` | Teardown (for tests or SPA cleanup) |
| `rumMark(name)` | Start a named mark; returns `end()` function |
| `collectCustomMetrics()` | Get current `performance.measure()` entries |

## Beacon Payload

Each beacon includes:

- **Core Web Vitals**: `lcp_ms`, `fcp_ms`, `inp_ms`, `cls`, `ttfb_ms`
- **Navigation timings**: `dom_interactive_ms`, `dom_complete_ms`, `load_event_ms`
- **Resource stats**: `total_transfer_bytes`, `resource_count`
- **Context**: `page_url`, `device_type`, `connection_type`, `nav_type`, `user_agent`
- **Custom**: `custom_metrics`, `labels`, `build_hash`

## License

MIT
