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
  console.log(message.content);
  if (message.content.startsWith("!ping")) {
    message.channel.send("Pong!");
  }
  if (client.user != null && message.mentions.users.has(client.user.id)) {
    message.channel.sendTyping();
    try {
      const response = await chatService.invoke(message.content);
      message.channel.send(response);
    } catch (e) {
      if (e instanceof Error) {
        message.channel.send(
          `「${e.message}」っていうエラーが出たよ。何かがうまくいっていないみたい。`
        );
      }
    }
  }
});

client.login(process.env.TOKEN);
