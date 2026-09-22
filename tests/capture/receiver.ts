// Реализация находится под src только из-за rootDir unit-тестов; runtime её не импортирует.
export { installReceiver } from '../../src/components/capture/testing/receiver';
export type {
  DeepReadonly,
  ReceiverOptions,
  ReceiverState,
  TestCaptureReceiver,
} from '../../src/components/capture/testing/receiver';
