// src/test-service.ts

import axios, { AxiosResponse } from "axios";
import {
  TelegramResponse,
  TelegramMessage,
  VaultEvent,
  PM2LogEntry,
} from "./types";
import dotenv from "dotenv";
dotenv.config();

// Test configuration
const CONFIG = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
    username: process.env.TELEGRAM_USERNAME_A!,
  },
};

class TestService {
  private async sendTelegramMessage(
    message: string,
    disableNotification = false
  ): Promise<boolean> {
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

      return response.data.ok;
    } catch (error) {
      console.error(
        "Telegram request failed:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  public async testTelegramConnection(): Promise<void> {
    console.log("Testing Telegram connection...");

    try {
      // Test basic connection
      const botInfo = await axios.get(
        `https://api.telegram.org/bot${CONFIG.telegram.botToken}/getMe`
      );
      console.log(
        "✅ Bot connection successful:",
        botInfo.data.result.username
      );

      // Test sending message
      const testMessage = `🧪 <b>Test Message from Voltr Alert Service</b>\n├ Bot: @${
        botInfo.data.result.username
      }\n├ Chat ID: ${
        CONFIG.telegram.chatId
      }\n└ Time: ${new Date().toLocaleString()}`;

      const success = await this.sendTelegramMessage(testMessage, true);

      if (success) {
        console.log("✅ Test message sent successfully");
      } else {
        console.error("❌ Failed to send test message");
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "❌ Telegram test failed:",
          error.response?.data || error.message
        );
      } else {
        console.error("❌ Telegram test failed:", error);
      }
    }
  }

  public async testInfoAlert(): Promise<void> {
    console.log("\nTesting info alert format...");

    const testMessage = `💰 <b>Vault Deposit</b>
├ Amount: $1,250
├ User: <code>ABC12345...XYZ98765</code>
├ Vault: <code>DT3srSkT...wccwgkE</code>
└ Time: ${new Date().toLocaleTimeString()}`;

    const success = await this.sendTelegramMessage(testMessage, true);

    if (success) {
      console.log("✅ Info alert test sent successfully");
    } else {
      console.log("❌ Info alert test failed");
    }
  }

  // NEW: Test request withdrawal info alert
  public async testRequestWithdrawalInfoAlert(): Promise<void> {
    console.log("\nTesting request withdrawal info alert...");

    const testMessage = `⏳ <b>Request PARTIAL WITHDRAWAL</b>
├ Amount: 25,000
├ Percentage: 📉 12.5%
├ User: <code>ABC12345...XYZ98765</code>
├ Vault: <code>DT3srSkT...wccwgkE</code>
├ Available: ${new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toLocaleDateString()}
└ Time: ${new Date().toLocaleTimeString()}`;

    const success = await this.sendTelegramMessage(testMessage, true);

    if (success) {
      console.log("✅ Request withdrawal info alert sent successfully");
    } else {
      console.log("❌ Request withdrawal info alert failed");
    }
  }

  // NEW: Test cancel request withdrawal info alert
  public async testCancelRequestWithdrawalAlert(): Promise<void> {
    console.log("\nTesting cancel request withdrawal alert...");

    const testMessage = `❌ <b>Cancel Withdrawal Request</b>
├ Amount: 25,000
├ User: <code>ABC12345...XYZ98765</code>
├ Vault: <code>DT3srSkT...wccwgkE</code>
└ Time: ${new Date().toLocaleTimeString()}`;

    const success = await this.sendTelegramMessage(testMessage, true);

    if (success) {
      console.log("✅ Cancel request withdrawal alert sent successfully");
    } else {
      console.log("❌ Cancel request withdrawal alert failed");
    }
  }

  public async testCriticalAlert(): Promise<void> {
    console.log("\nTesting critical alert format...");

    const testMessage = `🚨🚨🚨 <b>CRITICAL ALERT</b> 🚨🚨🚨
@${CONFIG.telegram.username}

💥 <b>LARGE VAULT DEPOSIT</b>
├ Amount: <b>$125,000</b>
├ Threshold: $100,000
├ User: <code>ABC12345...XYZ98765</code>
├ Vault: <code>DT3srSkT...wccwgkE</code>
└ Time: ${new Date().toLocaleString()}`;

    const success = await this.sendTelegramMessage(testMessage, false);

    if (success) {
      console.log("✅ Critical alert test sent successfully");
    } else {
      console.log("❌ Critical alert test failed");
    }
  }

  // NEW: Test large request withdrawal critical alert
  public async testLargeRequestWithdrawalAlert(): Promise<void> {
    console.log("\nTesting large request withdrawal critical alert...");

    const testMessage = `🚨🚨🚨 <b>CRITICAL ALERT</b> 🚨🚨🚨
@${CONFIG.telegram.username}

💥 <b>🔄 WITHDRAW ALL WITHDRAWAL</b>
├ Requested: <b>500,000</b>
├ Percentage: <b>85.2%</b>
├ Threshold: 15.0%
├ Available: ${new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toLocaleDateString()}
├ User: <code>ABC12345...XYZ98765</code>
├ Vault: <code>DT3srSkT...wccwgkE</code>
└ Time: ${new Date().toLocaleString()}`;

    const success = await this.sendTelegramMessage(testMessage, false);

    if (success) {
      console.log(
        "✅ Large request withdrawal critical alert sent successfully"
      );
    } else {
      console.log("❌ Large request withdrawal critical alert failed");
    }
  }

  public testLogParsing(): void {
    console.log("\nTesting log parsing...");

    // Test request withdrawal event parsing
    const requestWithdrawLogLine = `{"message":"{\\"level\\":\\"info\\",\\"time\\":\\"2025-08-11T10:30:15.162Z\\",\\"service\\":\\"voltr-vault-listener\\",\\"version\\":\\"unknown\\",\\"timestamp\\":\\"2025-08-11T10:30:15.162Z\\",\\"programId\\":\\"vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8\\",\\"eventName\\":\\"requestWithdrawVaultEvent\\",\\"slot\\":344046326,\\"eventData\\":{\\"vault\\":\\"DT3srSkTf2tyoAyz9nHf112MChkKEG7LGTGaGWccwgkE\\",\\"user\\":\\"ABC12345678901234567890123456789XYZ98765\\",\\"requestedAmount\\":50000000000,\\"isAmountInLp\\":false,\\"isWithdrawAll\\":false,\\"requestWithdrawVaultReceipt\\":\\"REQ123456789\\",\\"amountLpEscrowed\\":48500000000,\\"withdrawableFromTs\\":1723636215,\\"vaultAssetTotalValueUnlocked\\":300000000000,\\"vaultAssetTotalValue\\":350000000000,\\"requestedTs\\":1723629015},\\"message\\":\\"requestWithdrawVaultEvent received\\"}\\n","timestamp":"2025-08-11 10:30:15 +00:00","type":"out","process_id":1,"app_name":"voltr-vault"}`;

    try {
      const logEntry: PM2LogEntry = JSON.parse(requestWithdrawLogLine);
      const eventData: VaultEvent = JSON.parse(logEntry.message);

      console.log("✅ Request withdrawal log parsing successful");
      console.log("Event Name:", eventData.eventName);
      console.log("Vault:", eventData.eventData.vault);
      console.log("User:", eventData.eventData.user);
      console.log("Requested Amount:", eventData.eventData.requestedAmount);
      console.log("Is Withdraw All:", eventData.eventData.isWithdrawAll);
      console.log(
        "Withdrawable From:",
        new Date(
          (eventData.eventData.withdrawableFromTs ?? 0) * 1000
        ).toLocaleDateString()
      );

      // Calculate percentage
      const requestedAmount = eventData.eventData.requestedAmount ?? 0;
      const totalValue = eventData.eventData.vaultAssetTotalValueUnlocked ?? 1;
      const percentage = (requestedAmount / totalValue) * 100;
      console.log("Request Percentage:", `${percentage.toFixed(2)}%`);
    } catch (error) {
      console.error(
        "❌ Request withdrawal log parsing failed:",
        error instanceof Error ? error.message : error
      );
    }

    // Test cancel request withdrawal event parsing
    const cancelRequestLogLine = `{"message":"{\\"level\\":\\"info\\",\\"time\\":\\"2025-08-11T11:15:20.162Z\\",\\"service\\":\\"voltr-vault-listener\\",\\"version\\":\\"unknown\\",\\"timestamp\\":\\"2025-08-11T11:15:20.162Z\\",\\"programId\\":\\"vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8\\",\\"eventName\\":\\"cancelRequestWithdrawVaultEvent\\",\\"slot\\":344046500,\\"eventData\\":{\\"vault\\":\\"DT3srSkTf2tyoAyz9nHf112MChkKEG7LGTGaGWccwgkE\\",\\"user\\":\\"ABC12345678901234567890123456789XYZ98765\\",\\"requestWithdrawVaultReceipt\\":\\"REQ123456789\\",\\"amountLpRefunded\\":48500000000,\\"amountLpBurned\\":0,\\"cancelledTs\\":1723632615},\\"message\\":\\"cancelRequestWithdrawVaultEvent received\\"}\\n","timestamp":"2025-08-11 11:15:20 +00:00","type":"out","process_id":1,"app_name":"voltr-vault"}`;

    try {
      const logEntry: PM2LogEntry = JSON.parse(cancelRequestLogLine);
      const eventData: VaultEvent = JSON.parse(logEntry.message);

      console.log("✅ Cancel request withdrawal log parsing successful");
      console.log("Event Name:", eventData.eventName);
      console.log("Vault:", eventData.eventData.vault);
      console.log("User:", eventData.eventData.user);
      console.log("Amount LP Refunded:", eventData.eventData.amountLpRefunded);
      console.log("Amount LP Burned:", eventData.eventData.amountLpBurned);
    } catch (error) {
      console.error(
        "❌ Cancel request withdrawal log parsing failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  public testTypeDefinitions(): void {
    console.log("\nTesting enhanced TypeScript type definitions...");

    try {
      // Test enhanced VaultEvent with request withdrawal
      const sampleRequestEvent: VaultEvent = {
        level: "info",
        time: "2025-08-11T10:30:15.162Z",
        service: "voltr-vault-listener",
        version: "unknown",
        timestamp: "2025-08-11T10:30:15.162Z",
        programId: "vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8",
        eventName: "requestWithdrawVaultEvent",
        slot: 344046326,
        eventData: {
          vault: "DT3srSkTf2tyoAyz9nHf112MChkKEG7LGTGaGWccwgkE",
          user: "ABC12345678901234567890123456789XYZ98765",
          vaultAssetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          requestedAmount: 50000000000,
          isAmountInLp: false,
          isWithdrawAll: false,
          requestWithdrawVaultReceipt: "REQ123456789",
          amountLpEscrowed: 48500000000,
          withdrawableFromTs: 1723636215,
          vaultAssetTotalValueUnlocked: 300000000000,
          vaultAssetTotalValueBefore: 350000000000,
          vaultAssetTotalValueAfter: 350000000000,
          vaultLpSupplyInclFeesBefore: 340000000000,
          vaultLpSupplyInclFeesAfter: 340000000000,
          vaultHighestAssetPerLpDecimalBitsBefore: 1.0298401623395148,
          vaultHighestAssetPerLpDecimalBitsAfter: 1.0298401623395148,
          vaultAssetIdleAtaAmountBefore: 30862104,
          vaultAssetIdleAtaAmountAfter: 30862104,
          requestedTs: 1723629015,
        },
        message: "requestWithdrawVaultEvent received",
      };

      // Verify type checking works
      console.log("✅ Type definitions working correctly");
      console.log("Sample event type:", sampleRequestEvent.eventName);
      console.log(
        "Requested amount:",
        sampleRequestEvent.eventData.requestedAmount
      );
      console.log(
        "Is withdraw all:",
        sampleRequestEvent.eventData.isWithdrawAll
      );
    } catch (error) {
      console.error("❌ Type definition test failed:", error);
    }
  }

  public async runAllTests(): Promise<void> {
    console.log("🚀 Starting Voltr Alert Service TypeScript Tests\n");

    this.testTypeDefinitions();
    await this.delay(1000);

    await this.testTelegramConnection();
    await this.delay(1000);

    this.testLogParsing();
    await this.delay(1000);

    await this.testInfoAlert();
    await this.delay(2000);

    await this.testRequestWithdrawalInfoAlert();
    await this.delay(2000);

    await this.testCancelRequestWithdrawalAlert();
    await this.delay(2000);

    await this.testCriticalAlert();
    await this.delay(2000);

    await this.testLargeRequestWithdrawalAlert();

    console.log("\n✅ All tests completed!");
    console.log("\nNext steps:");
    console.log("1. npm install");
    console.log("2. Update CONFIG.logFile path in src/alert-service.ts");
    console.log("3. npm run dev (development) or npm start (production)");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testService = new TestService();
  testService.runAllTests().catch(console.error);
}
