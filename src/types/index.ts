// src/types/index.ts

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  usernameA: string;
  usernameB: string;
}

export interface AlertThresholds {
  largeVaultDepositPercent: number;
  largeVaultWithdrawalPercent: number;
  largeStrategyPnlPercent: number;
  highFrequencyEvents: number;
  highFrequencyWindow: number;
}

export interface RateLimitingConfig {
  infoDelay: number;
  criticalDelay: number;
  groupingWindow: number;
}

export interface ServiceConfig {
  telegram: TelegramConfig;
  logFile: string;
  thresholds: AlertThresholds;
  rateLimiting: RateLimitingConfig;
}

// Voltr Vault Event Types
export interface VaultEventData {
  manager?: string;
  vault: string;
  strategy?: string;
  strategyInitReceipt?: string;
  adaptorProgram?: string;
  vaultAssetMint: string;
  user?: string;

  // Amounts
  userAmountAssetDeposited?: number;
  userAmountAssetWithdrawn?: number;
  vaultAmountAssetDeposited?: number;
  vaultAmountAssetWithdrawn?: number;

  // Vault state
  vaultAssetTotalValueBefore: number;
  vaultAssetTotalValueAfter: number;
  vaultLpSupplyInclFeesBefore: number;
  vaultLpSupplyInclFeesAfter: number;
  vaultHighestAssetPerLpDecimalBitsBefore: number;
  vaultHighestAssetPerLpDecimalBitsAfter: number;
  vaultAssetIdleAtaAmountBefore: number;
  vaultAssetIdleAtaAmountAfter: number;

  // Strategy state
  strategyPositionValueBefore?: number;
  strategyPositionValueAfter?: number;

  // Timestamps
  depositedTs?: number;
  withdrawnTs?: number;
}

export interface VaultEvent {
  level: string;
  time: string;
  service: string;
  version: string;
  timestamp: string;
  programId: string;
  eventName: VaultEventName;
  slot: number;
  signature?: string;
  eventData: VaultEventData;
  message: string;
}

export type VaultEventName =
  | "depositVaultEvent"
  | "withdrawVaultEvent"
  | "depositStrategyEvent"
  | "withdrawStrategyEvent"
  | "directWithdrawStrategyEvent"
  | "harvestFeeEvent"
  | "initializeVaultEvent"
  | "requestWithdrawVaultEvent"
  | "cancelRequestWithdrawVaultEvent";

export interface PM2LogEntry {
  message: string;
  timestamp: string;
  type: "out" | "err";
  process_id: number;
  app_name: string;
}

// Alert Data Types
export interface BaseAlertData {
  type: string;
  vault: string;
  timestamp: string;
}

export interface InfoAlertData extends BaseAlertData {
  type:
    | "vault_deposit"
    | "vault_withdrawal"
    | "strategy_deposit"
    | "strategy_withdrawal"
    | "direct_strategy_withdrawal";
  amount: number;
  percentageChange: number;
  pnl?: number;
  pnlPercent?: number;
  user?: string;
  strategy?: string;
  manager?: string;
}

export interface CriticalAlertData extends BaseAlertData {
  type:
    | "large_vault_deposit"
    | "large_vault_withdrawal"
    | "large_strategy_deposit"
    | "large_strategy_withdrawal"
    | "strategy_significant_pnl"
    | "high_frequency";
}

export interface LargeTransactionAlert extends CriticalAlertData {
  type:
    | "large_vault_deposit"
    | "large_vault_withdrawal"
    | "large_strategy_deposit"
    | "large_strategy_withdrawal";
  amount: number;
  percentage: number;
  threshold: number;
  user?: string;
  strategy?: string;
  manager?: string;
}

export interface StrategyPnLAlert extends CriticalAlertData {
  type: "strategy_significant_pnl";
  amount: number;
  pnl: number;
  pnlPercent: number;
  pnlToAmountRatio: number; // |pnl| / amount - the key metric for thresholding
  threshold: number;
  vault: string;
  strategy: string;
  manager?: string;
  user?: string;
  timestamp: string;
}

export interface HighFrequencyAlert extends CriticalAlertData {
  type: "high_frequency";
  eventType: VaultEventName;
  rate: number;
  threshold: number;
  timeWindow: string;
}

export type AlertData =
  | InfoAlertData
  | LargeTransactionAlert
  | StrategyPnLAlert
  | HighFrequencyAlert;

// Telegram API Types
export interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode: "HTML" | "Markdown";
  disable_notification: boolean;
}

export interface TelegramResponse {
  ok: boolean;
  result?: any;
  error_code?: number;
  description?: string;
}

// Utility Types
export type EventFrequencyMap = Map<string, number[]>;
export type AlertTimestampMap = Map<string, number>;
export type GroupedEventsMap = Map<string, VaultEvent[]>;
