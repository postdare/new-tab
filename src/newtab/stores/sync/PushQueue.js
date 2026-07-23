import {
  PUSH_BUSY_RETRY_BASE_MS,
  PUSH_BUSY_RETRY_MAX_MS,
  PUSH_ERROR_RETRY_BASE_MS,
  PUSH_ERROR_RETRY_LIMIT,
} from "./constants";

/**
 * 推送队列：跟踪「本地脏版本 vs 已推送版本」，串行执行推送并按原因（busy/error）
 * 指数退避重试。busy 无限重试（等其它标签页释放锁），error 重试有上限，
 * 新的本地变更（markDirty）会重置 error 计数再次触发。
 *
 * 与宿主解耦：通过回调读取 provider/锁状态并执行实际推送。
 */
export default class PushQueue {
  _dirtyRevision = 0;
  _syncedRevision = 0;
  _busyRetryCount = 0;
  _errorRetryCount = 0;
  _retryTimer = null;
  _retryAt = 0;
  _drainPromise = null;

  /**
   * @param {Object} host
   * @param {() => Promise<'ok'|'busy'|'error'>} host.push 执行一次推送
   * @param {() => boolean} host.isLocked 本地是否正在同步中
   * @param {() => boolean} host.hasProvider 同步是否已配置
   */
  constructor({ push, isLocked, hasProvider }) {
    this._push = push;
    this._isLocked = isLocked;
    this._hasProvider = hasProvider;
  }

  markDirty() {
    this._dirtyRevision += 1;
    this._errorRetryCount = 0;
  }

  hasPending() {
    return this._dirtyRevision > this._syncedRevision;
  }

  clearRetry() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
      this._retryAt = 0;
    }
  }

  reset() {
    this.clearRetry();
    this._dirtyRevision = 0;
    this._syncedRevision = 0;
    this._busyRetryCount = 0;
    this._errorRetryCount = 0;
  }

  drain() {
    if (this._drainPromise) return this._drainPromise;

    const task = this._run();
    const trackedTask = task.finally(() => {
      if (this._drainPromise === trackedTask) {
        this._drainPromise = null;
      }
    });
    this._drainPromise = trackedTask;
    return trackedTask;
  }

  _schedulePending(delayMs = 0) {
    if (!this._hasProvider() || !this.hasPending()) return;

    const runAt = Date.now() + delayMs;
    if (this._retryTimer && this._retryAt <= runAt) return;

    this.clearRetry();
    this._retryAt = runAt;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this._retryAt = 0;
      this.drain();
    }, delayMs);
  }

  _scheduleRetry(reason) {
    const isError = reason === 'error';
    if (isError && this._errorRetryCount >= PUSH_ERROR_RETRY_LIMIT) return;

    const baseMs = isError
      ? PUSH_ERROR_RETRY_BASE_MS
      : PUSH_BUSY_RETRY_BASE_MS;
    const retryCount = isError
      ? this._errorRetryCount
      : this._busyRetryCount;
    const exponentialDelay = baseMs * Math.pow(2, retryCount);
    const delayMs = isError
      ? exponentialDelay
      : Math.min(PUSH_BUSY_RETRY_MAX_MS, exponentialDelay);
    if (isError) {
      this._errorRetryCount += 1;
      this._busyRetryCount = 0;
    } else {
      this._busyRetryCount += 1;
    }
    this._schedulePending(delayMs);
  }

  async _run() {
    while (this._hasProvider() && this.hasPending()) {
      if (this._isLocked()) {
        this._scheduleRetry('busy');
        return 'busy';
      }

      const targetRevision = this._dirtyRevision;
      const result = await this._push();
      if (result !== 'ok') {
        this._scheduleRetry(result);
        return result;
      }

      this._syncedRevision = Math.max(this._syncedRevision, targetRevision);
      this._busyRetryCount = 0;
      this._errorRetryCount = 0;
      this.clearRetry();
    }
    return 'ok';
  }
}
