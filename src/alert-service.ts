// src/alert-service.ts

import fs from "fs";
import { Tail } from "tail";
import axios, { AxiosResponse } from "axios";
import {
  ServiceConfig,
  VaultEvent,
  PM2LogEntry,
  VaultEventName,
  AlertData,
  InfoAlertData,
  LargeTransactionAlert,
  HighFrequencyAlert,
  TelegramMessage,
  TelegramResponse,
  EventFrequencyMap,
  AlertTimestampMap,
  StrategyPnLAlert,
} from "./types";
import dotenv from "dotenv";
dotenv.config();

// Configuration changes
const CONFIG: ServiceConfig = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
    usernameA: process.env.TELEGRAM_USERNAME_A!,
    usernameB: process.env.TELEGRAM_USERNAME_B!,
  },

  logFile: "/root/.pm2/logs/voltr-vault-out.log",

  // Alert thresholds - now percentage-based for large transactions
  thresholds: {
    largeVaultDepositPercent: 0.1, // 10% of total vault value
    largeVaultWithdrawalPercent: 0.1, // 10% of total vault value
    largeStrategyMovePercent: 0.1, // 10% of total vault value
    largeStrategyPnlPercent: 0.01, // 1% PnL change
    highFrequencyEvents: 10,
    highFrequencyWindow: 60000,
  },

  rateLimiting: {
    infoDelay: 30000,
    criticalDelay: 300000,
    groupingWindow: 10000,
  },
};

class VoltrAlertService {
  private eventBuffer: VaultEvent[] = [];
  private lastAlerts: AlertTimestampMap = new Map();
  private eventCounts: EventFrequencyMap = new Map();
  private tail: Tail | null = null;

  constructor() {
    this.initLogWatcher();
    this.initPeriodicTasks();
  }

  private initLogWatcher(): void {
    console.log(`Starting to watch log file: ${CONFIG.logFile}`);

    // Check if log file exists
    if (!fs.existsSync(CONFIG.logFile)) {
      console.error(`Log file not found: ${CONFIG.logFile}`);
      process.exit(1);
    }

    // Watch the log file
    this.tail = new Tail(CONFIG.logFile);

    this.tail.on("line", (line: string) => {
      this.processLogLine(line);
    });

    this.tail.on("error", (error: Error) => {
      console.error("Log tail error:", error);
    });

    console.log("Log watcher initialized successfully");
  }

  private processLogLine(line: string): void {
    try {
      // Parse the PM2 log line
      const logEntry: PM2LogEntry = JSON.parse(line);

      // Extract the actual event message
      if (logEntry.message) {
        const eventData: VaultEvent = JSON.parse(logEntry.message);

        // Only process Voltr vault events
        if (
          eventData.service === "voltr-vault-listener" &&
          eventData.eventData
        ) {
          this.handleVaultEvent(eventData);
        }
      }
    } catch (error) {
      // Ignore parsing errors - not all lines are JSON
      // console.log('Non-JSON log line:', line);
    }
  }

  private handleVaultEvent(event: VaultEvent): void {
    const { eventName } = event;

    // Track event frequency
    this.trackEventFrequency(event);

    // Handle different event types
    switch (eventName) {
      case "depositVaultEvent":
        this.handleVaultDeposit(event);
        break;
      case "withdrawVaultEvent":
        this.handleVaultWithdrawal(event);
        break;
      case "depositStrategyEvent":
        this.handleStrategyDeposit(event);
        break;
      case "withdrawStrategyEvent":
        this.handleStrategyWithdrawal(event);
        break;
      case "directWithdrawStrategyEvent":
        this.handleDirectStrategyWithdraw(event);
        break;
      default:
      // console.log(`Unhandled event type: ${eventName}`);
    }
  }

  private trackEventFrequency(event: VaultEvent): void {
    const now = Date.now();
    const key = `${event.eventName}_${event.eventData.vault}`;

    if (!this.eventCounts.has(key)) {
      this.eventCounts.set(key, []);
    }

    const events = this.eventCounts.get(key)!;
    events.push(now);

    // Remove events older than the window
    const windowStart = now - CONFIG.thresholds.highFrequencyWindow;
    this.eventCounts.set(
      key,
      events.filter((time) => time > windowStart)
    );

    // Check for high frequency
    if (events.length >= CONFIG.thresholds.highFrequencyEvents) {
      const alertData: HighFrequencyAlert = {
        type: "high_frequency",
        eventType: event.eventName,
        vault: event.eventData.vault,
        rate: events.length,
        threshold: CONFIG.thresholds.highFrequencyEvents,
        timeWindow: "1 minute",
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(alertData);
    }
  }

  private handleVaultDeposit(event: VaultEvent): void {
    const { eventData } = event;
    const amount = eventData.userAmountAssetDeposited ?? 0;
    const totalValueBefore = eventData.vaultAssetTotalValueBefore ?? 1; // Avoid division by zero
    const totalValueAfter = eventData.vaultAssetTotalValueAfter ?? 0;
    const percentageChange =
      ((totalValueAfter - totalValueBefore) / totalValueBefore) * 100;
    const transactionPercent = (amount / totalValueBefore) * 100;

    // Send info notification with percentage change
    const infoAlert: InfoAlertData = {
      type: "vault_deposit",
      amount: amount,
      vault: eventData.vault,
      user: eventData.user!,
      percentageChange: percentageChange,
      timestamp: event.timestamp,
    };
    this.sendInfoAlert(infoAlert);

    // Check for large deposit based on percentage
    if (transactionPercent > CONFIG.thresholds.largeVaultDepositPercent * 100) {
      const criticalAlert: LargeTransactionAlert = {
        type: "large_vault_deposit",
        amount: amount,
        percentage: transactionPercent,
        threshold: CONFIG.thresholds.largeVaultDepositPercent * 100,
        vault: eventData.vault,
        user: eventData.user!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }
  }

  private handleVaultWithdrawal(event: VaultEvent): void {
    const { eventData } = event;
    const amount = eventData.userAmountAssetWithdrawn ?? 0;
    const totalValueBefore = eventData.vaultAssetTotalValueBefore ?? 1;
    const totalValueAfter = eventData.vaultAssetTotalValueAfter ?? 0;
    const percentageChange =
      ((totalValueAfter - totalValueBefore) / totalValueBefore) * 100;
    const transactionPercent = (amount / totalValueBefore) * 100;

    // Send info notification with percentage change
    const infoAlert: InfoAlertData = {
      type: "vault_withdrawal",
      amount: amount,
      vault: eventData.vault,
      user: eventData.user!,
      percentageChange: percentageChange,
      timestamp: event.timestamp,
    };
    this.sendInfoAlert(infoAlert);

    // Check for large withdrawal based on percentage
    if (
      transactionPercent >
      CONFIG.thresholds.largeVaultWithdrawalPercent * 100
    ) {
      const criticalAlert: LargeTransactionAlert = {
        type: "large_vault_withdrawal",
        amount: amount,
        percentage: transactionPercent,
        threshold: CONFIG.thresholds.largeVaultWithdrawalPercent * 100,
        vault: eventData.vault,
        user: eventData.user!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }
  }

  private handleStrategyDeposit(event: VaultEvent): void {
    const { eventData } = event;
    const amount = eventData.vaultAmountAssetDeposited ?? 0;
    const totalValueBefore = eventData.vaultAssetTotalValueBefore ?? 1;
    const totalValueAfter = eventData.vaultAssetTotalValueAfter ?? 0;
    const transactionPercent = (amount / totalValueBefore) * 100;
    const pnl = totalValueAfter - totalValueBefore;
    const pnlPercent = (pnl / totalValueBefore) * 100;

    // Send info notification with PnL details
    const infoAlert: InfoAlertData = {
      type: "strategy_deposit",
      amount: amount,
      vault: eventData.vault,
      strategy: eventData.strategy!,
      manager: eventData.manager!,
      percentageChange: transactionPercent, // This is the transaction size as % of vault
      pnl: pnl,
      pnlPercent: pnlPercent,
      timestamp: event.timestamp,
    };
    this.sendInfoAlert(infoAlert);

    // Check for significant PnL change relative to transaction amount
    const pnlToAmountRatio = Math.abs(pnl / amount);
    if (pnlToAmountRatio > CONFIG.thresholds.largeStrategyPnlPercent) {
      const criticalAlert: StrategyPnLAlert = {
        type: "strategy_significant_pnl",
        amount: amount,
        pnl: pnl,
        pnlPercent: pnlPercent,
        pnlToAmountRatio: pnlToAmountRatio,
        threshold: CONFIG.thresholds.largeStrategyPnlPercent,
        vault: eventData.vault,
        strategy: eventData.strategy!,
        manager: eventData.manager!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }

    // Check for large strategy move based on transaction size percentage
    if (transactionPercent > CONFIG.thresholds.largeStrategyMovePercent * 100) {
      const criticalAlert: LargeTransactionAlert = {
        type: "large_strategy_deposit",
        amount: amount,
        percentage: transactionPercent,
        threshold: CONFIG.thresholds.largeStrategyMovePercent * 100,
        vault: eventData.vault,
        strategy: eventData.strategy!,
        manager: eventData.manager!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }
  }

  private handleStrategyWithdrawal(event: VaultEvent): void {
    const { eventData } = event;
    const amount = eventData.vaultAmountAssetWithdrawn ?? 0;
    const totalValueBefore = eventData.vaultAssetTotalValueBefore ?? 1;
    const totalValueAfter = eventData.vaultAssetTotalValueAfter ?? 0;
    const transactionPercent = (amount / totalValueBefore) * 100;
    const pnl = totalValueAfter - totalValueBefore;
    const pnlPercent = (pnl / totalValueBefore) * 100;

    // Send info notification with PnL details
    const infoAlert: InfoAlertData = {
      type: "strategy_withdrawal",
      amount: amount,
      vault: eventData.vault,
      strategy: eventData.strategy!,
      manager: eventData.manager!,
      percentageChange: transactionPercent,
      pnl: pnl,
      pnlPercent: pnlPercent,
      timestamp: event.timestamp,
    };
    this.sendInfoAlert(infoAlert);

    // Check for significant PnL change relative to transaction amount
    const pnlToAmountRatio = Math.abs(pnl / amount);
    if (pnlToAmountRatio > CONFIG.thresholds.largeStrategyPnlPercent) {
      const criticalAlert: StrategyPnLAlert = {
        type: "strategy_significant_pnl",
        amount: amount,
        pnl: pnl,
        pnlPercent: pnlPercent,
        pnlToAmountRatio: pnlToAmountRatio,
        threshold: CONFIG.thresholds.largeStrategyPnlPercent,
        vault: eventData.vault,
        strategy: eventData.strategy!,
        manager: eventData.manager!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }

    // Check for large strategy move based on transaction size percentage
    if (transactionPercent > CONFIG.thresholds.largeStrategyMovePercent * 100) {
      const criticalAlert: LargeTransactionAlert = {
        type: "large_strategy_withdrawal",
        amount: amount,
        percentage: transactionPercent,
        threshold: CONFIG.thresholds.largeStrategyMovePercent * 100,
        vault: eventData.vault,
        strategy: eventData.strategy!,
        manager: eventData.manager!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }
  }

  // Updated direct strategy withdrawal handler
  private handleDirectStrategyWithdraw(event: VaultEvent): void {
    const { eventData } = event;
    const amount = eventData.userAmountAssetWithdrawn ?? 0;
    const totalValueBefore = eventData.vaultAssetTotalValueBefore ?? 1;
    const totalValueAfter = eventData.vaultAssetTotalValueAfter ?? 0;
    const percentageChange =
      ((totalValueAfter - totalValueBefore) / totalValueBefore) * 100;
    const pnl = totalValueAfter - totalValueBefore;
    const pnlPercent = (pnl / totalValueBefore) * 100;

    // Send info notification with PnL details
    const infoAlert: InfoAlertData = {
      type: "direct_strategy_withdrawal",
      amount: amount,
      vault: eventData.vault,
      strategy: eventData.strategy!,
      user: eventData.user!,
      percentageChange: percentageChange,
      pnl: pnl,
      pnlPercent: pnlPercent,
      timestamp: event.timestamp,
    };
    this.sendInfoAlert(infoAlert);

    // Check for significant PnL change relative to transaction amount
    const pnlToAmountRatio = Math.abs(pnl / amount);
    if (pnlToAmountRatio > CONFIG.thresholds.largeStrategyPnlPercent) {
      const criticalAlert: StrategyPnLAlert = {
        type: "strategy_significant_pnl",
        amount: amount,
        pnl: pnl,
        pnlPercent: pnlPercent,
        pnlToAmountRatio: pnlToAmountRatio,
        threshold: CONFIG.thresholds.largeStrategyPnlPercent,
        vault: eventData.vault,
        strategy: eventData.strategy!,
        user: eventData.user!,
        timestamp: event.timestamp,
      };
      this.sendCriticalAlert(criticalAlert);
    }
  }

  private async sendInfoAlert(alertData: InfoAlertData): Promise<void> {
    const key = `info_${alertData.type}_${alertData.vault}`;

    // Rate limiting for info alerts
    if (this.shouldRateLimit(key, CONFIG.rateLimiting.infoDelay)) {
      return;
    }

    const message = this.formatInfoMessage(alertData);
    await this.sendTelegramMessage(message, true); // true = disable notification
  }

  private async sendCriticalAlert(alertData: AlertData): Promise<void> {
    const key = `critical_${alertData.type}_${alertData.vault}`;

    // Rate limiting for critical alerts
    if (this.shouldRateLimit(key, CONFIG.rateLimiting.criticalDelay)) {
      return;
    }

    const message = this.formatCriticalMessage(alertData);
    await this.sendTelegramMessage(message, false); // false = enable notification
  }

  private shouldRateLimit(key: string, delay: number): boolean {
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(key);

    if (lastAlert && now - lastAlert < delay) {
      return true;
    }

    this.lastAlerts.set(key, now);
    return false;
  }

  private formatInfoMessage(data: InfoAlertData): string {
    const shortAddress = (addr?: string): string =>
      addr ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : "Unknown";
    const time = new Date().toLocaleTimeString();
    const changeIcon = data.percentageChange >= 0 ? "📈" : "📉";
    const changeText = `${changeIcon} ${data.percentageChange?.toFixed(2)}%`;

    // PnL formatting for strategy events
    const formatPnL = (pnl?: number, pnlPercent?: number): string => {
      if (pnl === undefined || pnlPercent === undefined) return "";
      const pnlIcon = pnl >= 0 ? "💚" : "❤️";
      const sign = pnl >= 0 ? "+" : "";
      return `\n├ PnL: ${pnlIcon} ${sign}${pnl.toLocaleString()} (${sign}${pnlPercent.toFixed(
        2
      )}%)`;
    };

    switch (data.type) {
      case "vault_deposit":
        return `💰 <b>Vault Deposit</b>\n├ Amount: ${data.amount.toLocaleString()}\n├ Change: ${changeText}\n├ User: <code>${shortAddress(
          data.user
        )}</code>\n├ Vault: <code>${shortAddress(
          data.vault
        )}</code>\n└ Time: ${time}`;

      case "vault_withdrawal":
        return `💸 <b>Vault Withdrawal</b>\n├ Amount: ${data.amount.toLocaleString()}\n├ Change: ${changeText}\n├ User: <code>${shortAddress(
          data.user
        )}</code>\n├ Vault: <code>${shortAddress(
          data.vault
        )}</code>\n└ Time: ${time}`;

      case "strategy_deposit":
        return `📈 <b>Strategy Deposit</b>\n├ Amount: ${data.amount.toLocaleString()}\n├ Size: ${changeText}${formatPnL(
          data.pnl,
          data.pnlPercent
        )}\n├ Strategy: <code>${shortAddress(
          data.strategy
        )}</code>\n├ Vault: <code>${shortAddress(
          data.vault
        )}</code>\n├ Manager: <code>${shortAddress(
          data.manager
        )}</code>\n└ Time: ${time}`;

      case "strategy_withdrawal":
        return `📉 <b>Strategy Withdrawal</b>\n├ Amount: ${data.amount.toLocaleString()}\n├ Size: ${changeText}${formatPnL(
          data.pnl,
          data.pnlPercent
        )}\n├ Strategy: <code>${shortAddress(
          data.strategy
        )}</code>\n├ Vault: <code>${shortAddress(
          data.vault
        )}</code>\n├ Manager: <code>${shortAddress(
          data.manager
        )}</code>\n└ Time: ${time}`;

      case "direct_strategy_withdrawal":
        return `🔄 <b>Direct Strategy Withdrawal</b>\n├ Amount: ${data.amount.toLocaleString()}\n├ Change: ${changeText}${formatPnL(
          data.pnl,
          data.pnlPercent
        )}\n├ User: <code>${shortAddress(
          data.user
        )}</code>\n├ Strategy: <code>${shortAddress(
          data.strategy
        )}</code>\n├ Vault: <code>${shortAddress(
          data.vault
        )}</code>\n└ Time: ${time}`;

      default:
        return `ℹ️ <b>Vault Event</b>\n└ Type: ${data.type}`;
    }
  }

  // Updated critical message formatting
  private formatCriticalMessage(data: AlertData): string {
    const shortAddress = (addr?: string): string =>
      addr ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : "Unknown";
    const time = new Date().toLocaleString();

    let message = `🚨🚨🚨 <b>CRITICAL ALERT</b> 🚨🚨🚨\n@${CONFIG.telegram.usernameA}\n@${CONFIG.telegram.usernameB}\n\n`;

    if (data.type.startsWith("large_")) {
      const transactionData = data as LargeTransactionAlert;
      const action = data.type.includes("deposit") ? "DEPOSIT" : "WITHDRAWAL";
      const context = data.type.includes("vault") ? "VAULT" : "STRATEGY";

      message += `💥 <b>LARGE ${context} ${action}</b>\n`;
      message += `├ Amount: <b>${transactionData.amount.toLocaleString()}</b>\n`;
      message += `├ Percentage: <b>${transactionData.percentage.toFixed(
        2
      )}%</b>\n`;
      message += `├ Threshold: ${transactionData.threshold}%\n`;

      if (transactionData.user) {
        message += `├ User: <code>${shortAddress(
          transactionData.user
        )}</code>\n`;
      }
      if (transactionData.strategy) {
        message += `├ Strategy: <code>${shortAddress(
          transactionData.strategy
        )}</code>\n`;
      }
      if (transactionData.manager) {
        message += `├ Manager: <code>${shortAddress(
          transactionData.manager
        )}</code>\n`;
      }
      message += `├ Vault: <code>${shortAddress(transactionData.vault)}</code>`;
    } else if (data.type === "strategy_significant_pnl") {
      const pnlData = data as StrategyPnLAlert;
      const pnlIcon = pnlData.pnl >= 0 ? "💚 GAIN" : "❤️ LOSS";
      const sign = pnlData.pnl >= 0 ? "+" : "";

      message += `📊 <b>STRATEGY SIGNIFICANT PnL ${pnlIcon}</b>\n`;
      message += `├ PnL: <b>${sign}${pnlData.pnl.toLocaleString()} (${sign}${pnlData.pnlPercent.toFixed(
        2
      )}%)</b>\n`;
      message += `├ Amount: ${pnlData.amount.toLocaleString()}\n`;
      message += `├ PnL Ratio: ${(pnlData.pnlToAmountRatio * 100).toFixed(
        1
      )}%\n`;
      message += `├ Threshold: ${(pnlData.threshold * 100).toFixed(1)}%\n`;
      message += `├ Strategy: <code>${shortAddress(pnlData.strategy)}</code>\n`;
      message += `├ Vault: <code>${shortAddress(pnlData.vault)}</code>\n`;
      if (pnlData.manager) {
        message += `├ Manager: <code>${shortAddress(pnlData.manager)}</code>`;
      }
      if (pnlData.user) {
        message += `├ User: <code>${shortAddress(pnlData.user)}</code>`;
      }
    } else if (data.type === "high_frequency") {
      const frequencyData = data as HighFrequencyAlert;
      message += `⚡ <b>HIGH FREQUENCY ACTIVITY</b>\n`;
      message += `├ Event Type: ${frequencyData.eventType}\n`;
      message += `├ Rate: <b>${frequencyData.rate} events/${frequencyData.timeWindow}</b>\n`;
      message += `├ Threshold: ${frequencyData.threshold} events/${frequencyData.timeWindow}\n`;
      message += `├ Vault: <code>${shortAddress(frequencyData.vault)}</code>`;
    } else {
      message += `🔧 <b>UNKNOWN CRITICAL EVENT</b>\n├ Type: ${data.type}`;
    }

    message += `\n└ Time: ${time}`;
    return message;
  }

  private async sendTelegramMessage(
    message: string,
    disableNotification = false
  ): Promise<void> {
    try {
      const telegramMessage: TelegramMessage = {
        chat_id: CONFIG.telegram.chatId,
        text: message,
        parse_mode: "HTML",
        disable_notification: disableNotification,
      };

      const response: AxiosResponse<TelegramResponse> = await axios.post(
        `https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`,
        telegramMessage
      );

      if (!response.data.ok) {
        console.error("Telegram API error:", response.data);
      }
    } catch (error) {
      console.error(
        "Failed to send Telegram message:",
        error instanceof Error ? error.message : error
      );
    }
  }

  private initPeriodicTasks(): void {
    // Clean up old event counts every minute
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - CONFIG.thresholds.highFrequencyWindow;

      for (const [key, events] of this.eventCounts.entries()) {
        const filtered = events.filter((time) => time > cutoff);
        if (filtered.length === 0) {
          this.eventCounts.delete(key);
        } else {
          this.eventCounts.set(key, filtered);
        }
      }
    }, 60000);

    // Clean up old alert timestamps every 10 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const [key, timestamp] of this.lastAlerts.entries()) {
        if (now - timestamp > maxAge) {
          this.lastAlerts.delete(key);
        }
      }
    }, 600000);

    // Send heartbeat every hour
    setInterval(() => {
      console.log(
        `Voltr Alert Service heartbeat - ${new Date().toISOString()}`
      );
      console.log(`Watching ${this.eventCounts.size} vault/event combinations`);
    }, 3600000);
  }

  public async sendTestMessage(): Promise<void> {
    const testMessage = `🧪 <b>Voltr Alert Service Started</b>\n├ Bot Token: ...${CONFIG.telegram.botToken.slice(
      -8
    )}\n├ Chat ID: ${CONFIG.telegram.chatId}\n├ Log File: ${
      CONFIG.logFile
    }\n└ Time: ${new Date().toLocaleString()}`;

    await this.sendTelegramMessage(testMessage, false);
  }

  public shutdown(): void {
    console.log("Shutting down Voltr Alert Service...");
    if (this.tail) {
      this.tail.unwatch();
    }
    process.exit(0);
  }
}

// Start the service
const alertService = new VoltrAlertService();

// Send test message on startup
alertService.sendTestMessage();

// Handle graceful shutdown
process.on("SIGINT", () => alertService.shutdown());
process.on("SIGTERM", () => alertService.shutdown());

console.log("Voltr Alert Service started successfully!");
