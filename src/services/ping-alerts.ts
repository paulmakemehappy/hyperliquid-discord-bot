import type { PingAlert } from "../types";

export class PingAlertService {
  private readonly alerts = new Map<string, PingAlert>();

  add(alert: PingAlert): void {
    this.alerts.set(alert.id, alert);
  }

  evaluate(mids: Record<string, number>): PingAlert[] {
    const triggered: PingAlert[] = [];

    for (const [id, alert] of this.alerts.entries()) {
      const currentPrice = mids[alert.coin];
      if (!currentPrice) {
        continue;
      }

      const crossed = alert.startsBelowTarget
        ? currentPrice >= alert.targetPrice
        : currentPrice <= alert.targetPrice;

      if (!crossed) {
        continue;
      }

      this.alerts.delete(id);
      triggered.push(alert);
    }

    return triggered;
  }
}
