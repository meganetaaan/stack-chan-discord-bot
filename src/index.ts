import { type Message, Client } from "discord.js";
import dotenv from "dotenv";
import { ChatService } from "./services/chat";

dotenv.config();
console.log(process.env.DISCORD_TOKEN);

const chatService = new ChatService();
const client = new Client({
  intents: ["Guilds", "GuildMessages", "MessageContent"],
});

client.once("ready", () => {
  console.log("Ready!");
  console.log(`id: ${client.user?.id}, tag: ${client.user?.tag}`);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) {
    return;
  }
  console.debug(message.content);
  if (client.user != null && message.mentions.users.has(client.user.id)) {
    message.channel.sendTyping();
    try {
      const messages = await message.channel.messages.fetch({ limit: 10 });
      const history = messages
        .reverse()
        .map((msg) => `${msg.author.displayName}: ${msg.content}`)
        .join("\n\n");
      console.debug(history);
      console.debug(message.content);
      const response = await chatService.invoke(history
        // `${history}\n\n${message.author.displayName}: ${message.content}`
      );
      console.debug(response);
      message.channel.send(response);
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message);
        message.channel.send(
          `「${e.message}」っていうエラーが出たよ。何かがうまくいっていないみたい。`
        );
      }
    }
  }
});

client.login(process.env.TOKEN);
