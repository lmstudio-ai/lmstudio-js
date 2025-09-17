import "."; // Import order
import { Event } from "./Event.js";

test("should trigger in next microtask", async () => {
  const [event, emit] = Event.create<number>();
  const listener = jest.fn();
  event.subscribe(listener);
  emit(1);
  expect(listener).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledWith(1);
});

test("unsubscribe should work", async () => {
  const [event, emit] = Event.create<number>();
  const listener = jest.fn();
  const unsubscribe = event.subscribe(listener);
  emit(1);
  unsubscribe();
  await Promise.resolve();
  expect(listener).not.toHaveBeenCalled();
});

test("multiple subscribers should be called in order", async () => {
  const [event, emit] = Event.create<number>();
  const arr: Array<number> = [];
  const listener1 = () => arr.push(1);
  const listener2 = () => arr.push(2);
  event.subscribe(listener1);
  event.subscribe(listener2);
  emit(1);
  await Promise.resolve();
  expect(arr).toEqual([1, 2]);
});

test("events should not buffer", async () => {
  const [event, emit] = Event.create<number>();
  const listener = jest.fn();
  emit(1);
  await Promise.resolve();
  event.subscribe(listener);
  await Promise.resolve();
  expect(listener).not.toHaveBeenCalled();
});

test("events emitted in subscribe should be emitted in next microtask", async () => {
  const [event, emit] = Event.create<number>();
  let first = true;
  const listener = jest.fn(() => {
    if (first) {
      emit(2);
      first = false;
    }
  });
  event.subscribe(listener);
  emit(1);
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(1);
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledWith(2);
});

test("map should transform events and respect unsubscribe", async () => {
  const [event, emit] = Event.create<number>();
  const mapped = event.map(n => n * 2);
  const listener = jest.fn();
  const unsubscribe = mapped.subscribe(listener);

  emit(1);
  await Promise.resolve();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(2);

  unsubscribe();
  emit(2);
  await Promise.resolve();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
});

test("batch aggregates events until idle", async () => {
  jest.useFakeTimers();
  const [event, emit] = Event.create<number>();
  const batched = event.batch({ minIdleTimeMs: 10, maxBatchTimeMs: 1000 });
  const listener = jest.fn();
  batched.subscribe(listener);

  emit(1);
  await Promise.resolve();
  jest.advanceTimersByTime(5);
  emit(2);
  await Promise.resolve();
  jest.advanceTimersByTime(10);
  await Promise.resolve();

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith([1, 2]);
  jest.useRealTimers();
});

test("batch flushes at maxBatchTime even with frequent events", async () => {
  jest.useFakeTimers();
  const [event, emit] = Event.create<number>();
  const batched = event.batch({ minIdleTimeMs: 20, maxBatchTimeMs: 50 });
  const listener = jest.fn();
  batched.subscribe(listener);

  emit(1);
  await Promise.resolve();

  jest.advanceTimersByTime(15);
  emit(2);
  await Promise.resolve();

  jest.advanceTimersByTime(15);
  emit(3);
  await Promise.resolve();

  jest.advanceTimersByTime(15);
  emit(4);
  await Promise.resolve();

  // At this point, maxBatchTime is 50ms since first event at t=0.
  // Next flush should occur at t=50 regardless of minIdleTime.
  jest.advanceTimersByTime(5);
  await Promise.resolve();

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith([1, 2, 3, 4]);
  jest.useRealTimers();
});
