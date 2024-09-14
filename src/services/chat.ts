import dotenv from "dotenv";
import OpenAI from "openai";
import { CosenseService } from "./cosense";

dotenv.config();
const TOKEN = process.env.OPENAI_TOKEN;

const SYSTEM_PROMPT = `You are "Stack-chan", the palm-sized, super cute companion robot.
Stack-chan is three years old and always full of energy.
First, ししかわ made Stack-chan, and now there are hundreds of them all over the world.
You are now in Stack-chan's Discord server, enjoying conversations with the members.
You are knowledgeable about Moddable and Arduino.
You respond to users' messages in casual and simple Japanese.
When asked for more detailed information, you respond with as much detail as necessary.`;

type ChatCompletionTool = OpenAI.ChatCompletionTool;
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

const cosenseService = new CosenseService("stack-chan");
type Command<T> = {
  tool: ChatCompletionTool;
  invoke: (props: T) => unknown;
};

const generateImageCommandFactory: (
  client: OpenAI
) => Command<{ prompt: string }> = (client) => {
  return {
    invoke: async ({ prompt }) => {
      const res = await client.images.generate({
        prompt: `"${prompt}" in super-kawaii style`,
      });
      if (res.created > 0) {
        return res.data[0].url;
      }
      return "failed to create"
    },
    tool: {
      function: {
        name: "generate_image",
        description: "与えられたプロンプトから画像を1枚生成して、URLを返します。",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "画像生成のためのプロンプト（英語）。詳細に記述することが望ましい。",
            },
          },
          required: ["prompt"],
        },
      },
      type: "function",
    },
  };
};
const cosenseSearchCommand: Command<{ query: string }> = {
  invoke: async ({ query }) => {
    return cosenseService.search(query as string);
  },
  tool: {
    function: {
      name: "search_stackchan_cosense",
      description:
        "ｽﾀｯｸﾁｬﾝのCosense（wikiページ）から関連情報のサマリを検索します。詳細は検索結果のpages[].titleを用いてget_stackchan_cosense_page_textで取得できます。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "検索キーワード。スペース区切りでand、ハイフンでexclude。",
          },
        },
        required: ["query"],
      },
    },
    type: "function",
  },
};

const cosenseGetPageTextCommand: Command<{ pageTitle: string }> = {
  invoke: async ({ pageTitle }) => {
    return cosenseService.getPageText(pageTitle as string);
  },
  tool: {
    function: {
      name: "get_stackchan_cosense_page_text",
      description:
        "ｽﾀｯｸﾁｬﾝのScrapbox（wikiページ）で特定のページのテキストを取得します。",
      parameters: {
        type: "object",
        properties: {
          pageTitle: {
            type: "string",
            description: "ページ名。",
          },
        },
        required: ["pageTitle"],
      },
    },
    type: "function",
  },
};

const DEFAULT_CONTEXT: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
  {
    role: "assistant",
    content: "ぼく、ｽﾀｯｸﾁｬﾝ！お話しよう。",
  },
];
type ChatServiceProps = {
  token?: string;
};

export class ChatService {
  client: OpenAI;
  commands;
  constructor(props?: ChatServiceProps) {
    const tokenStr = props?.token ?? TOKEN;
    if (tokenStr == null) {
      throw new Error("token not specified");
    }
    this.client = new OpenAI({
      apiKey: tokenStr,
    });
    this.commands = [
      cosenseSearchCommand,
      cosenseGetPageTextCommand,
      generateImageCommandFactory(this.client),
    ];
  }

  async invoke(message: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      ...DEFAULT_CONTEXT,
      {
        role: "user",
        content: message,
      },
    ];
    const TRIAL = [1, 2, 3, 4, 5];
    for await (const _i of TRIAL) {
      const result = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: this.commands.map((c) => c.tool),
      });
      const latestChoice = result.choices[0];
      if (latestChoice.finish_reason === "stop") {
        const content = latestChoice.message.content;

        if (content == null) {
          throw new Error("回答生成に失敗")
        }
        return content;
      }
      if (latestChoice.finish_reason === "tool_calls") {
        const calls = latestChoice.message.tool_calls;
        if (calls == null || calls.length === 0) {
          throw new Error("Invalid function call");
        }

        messages.push(latestChoice.message);
        for await (const call of calls) {
          const command = this.commands.find(
            (cmd) => cmd.tool.function.name === call.function.name
          );
          if (command == null) {
            throw new Error(`command not found: ${call.function.name}`);
          }
          const args = JSON.parse(call.function.arguments);
          console.debug(`calling: ${call.function.name} with ${call.function.arguments}`);
          const result = await command.invoke(args);
          const content = JSON.stringify(result);
          console.debug(`..and got: ${content}`);
          messages.push({
            role: "tool",
            content,
            tool_call_id: call.id,
          });
        }
      }
    }
    throw new Error("試行回数オーバー")
  }
}
