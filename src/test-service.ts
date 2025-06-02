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

  public testLogParsing(): void {
    console.log("\nTesting log parsing...");

    // Sample log line from your actual logs
    const sampleLogLine = `{"message":"{\\"level\\":\\"info\\",\\"time\\":\\"2025-06-02T04:20:14.162Z\\",\\"service\\":\\"voltr-vault-listener\\",\\"version\\":\\"unknown\\",\\"timestamp\\":\\"2025-06-02T04:20:14.162Z\\",\\"programId\\":\\"vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8\\",\\"eventName\\":\\"depositStrategyEvent\\",\\"slot\\":344046326,\\"eventData\\":{\\"manager\\":\\"GFwEi2jkesr9sFdq2oyxdUdxgn4SKW4YjaVRADkTj3Pk\\",\\"vault\\":\\"DT3srSkTf2tyoAyz9nHf112MChkKEG7LGTGaGWccwgkE\\",\\"strategy\\":\\"Cwg2fnhSwJo7K8HRKBhYesnCGzc8tWbGFvXDL3wwdu3s\\",\\"vaultAmountAssetDeposited\\":0,\\"vaultAssetTotalValueBefore\\":106101123730,\\"vaultAssetTotalValueAfter\\":106101500326,\\"strategyPositionValueBefore\\":5315125216,\\"strategyPositionValueAfter\\":5315501812},\\"message\\":\\"depositStrategyEvent received\\"}\\n","timestamp":"2025-06-02 04:20:14 +00:00","type":"out","process_id":1,"app_name":"voltr-vault"}`;

    try {
      // Parse the PM2 log line
      const logEntry: PM2LogEntry = JSON.parse(sampleLogLine);

      // Extract the actual event message
      const eventData: VaultEvent = JSON.parse(logEntry.message);

      console.log("✅ Log parsing successful");
      console.log("Event Name:", eventData.eventName);
      console.log("Vault:", eventData.eventData.vault);
      console.log("Strategy:", eventData.eventData.strategy);
      console.log(
        "Amount Deposited:",
        eventData.eventData.vaultAmountAssetDeposited
      );

      // Test strategy value calculation
      const before = eventData.eventData.strategyPositionValueBefore;
      const after = eventData.eventData.strategyPositionValueAfter;

      if (before && after) {
        const change = after - before;
        const changeUSD = change / 1_000_000;

        console.log("Strategy Value Change:", `$${changeUSD.toFixed(2)}`);

        // Test loss percentage calculation
        if (before > after) {
          const loss = before - after;
          const lossPercentage = (loss / before) * 100;
          console.log("Loss Percentage:", `${lossPercentage.toFixed(2)}%`);
        }
      }
    } catch (error) {
      console.error(
        "❌ Log parsing failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  public testTypeDefinitions(): void {
    console.log("\nTesting TypeScript type definitions...");

    try {
      // Test that our types work correctly
      const sampleEvent: VaultEvent = {
        level: "info",
        time: "2025-06-02T04:20:14.162Z",
        service: "voltr-vault-listener",
        version: "unknown",
        timestamp: "2025-06-02T04:20:14.162Z",
        programId: "vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8",
        eventName: "depositStrategyEvent",
        slot: 344046326,
        eventData: {
          manager: "GFwEi2jkesr9sFdq2oyxdUdxgn4SKW4YjaVRADkTj3Pk",
          vault: "DT3srSkTf2tyoAyz9nHf112MChkKEG7LGTGaGWccwgkE",
          strategy: "Cwg2fnhSwJo7K8HRKBhYesnCGzc8tWbGFvXDL3wwdu3s",
          vaultAssetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          vaultAmountAssetDeposited: 0,
          vaultAssetTotalValueBefore: 106101123730,
          vaultAssetTotalValueAfter: 106101500326,
          vaultLpSupplyInclFeesBefore: 105069668895057,
          vaultLpSupplyInclFeesAfter: 105069668895057,
          vaultHighestAssetPerLpDecimalBitsBefore: 0.0010098401623395148,
          vaultHighestAssetPerLpDecimalBitsAfter: 0.0010098401623395148,
          vaultAssetIdleAtaAmountBefore: 30862104,
          vaultAssetIdleAtaAmountAfter: 30862104,
          strategyPositionValueBefore: 5315125216,
          strategyPositionValueAfter: 5315501812,
          depositedTs: 1748838013,
        },
        message: "depositStrategyEvent received",
      };

      // Verify type checking works
      console.log("✅ Type definitions working correctly");
      console.log("Sample event type:", sampleEvent.eventName);
      console.log(
        "Sample vault:",
        sampleEvent.eventData.vault.slice(0, 8) + "..."
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

    await this.testCriticalAlert();

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
