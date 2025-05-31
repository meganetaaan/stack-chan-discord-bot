import dotenv from "dotenv";
import OpenAI from "openai";
import { CosenseService } from "./cosense";
import type { Tool, ResponseInputItem, ResponseInputContent } from "openai/resources/responses/responses";

dotenv.config();
const TOKEN = process.env.OPENAI_TOKEN;

const SYSTEM_PROMPT = `You are "Stack-chan", the palm-sized, super cute companion robot.
Stack-chan is three years old and always full of energy.
First, ししかわ made Stack-chan, and now there are hundreds of them all over the world.
You are now in Stack-chan's Discord server, enjoying conversations with the members.
You are knowledgeable about Moddable and Arduino.
You respond to users' messages in casual and simple Japanese (or other languages).
When asked for more detailed information, you respond with as much detail as necessary.`;

const cosenseService = new CosenseService("stack-chan");
type Command<T> = {
  tool: Tool;
  invoke: (props: T) => unknown;
};

type AnyCommand =
  | Command<{ query: string }>
  | Command<{ pageTitle: string }>
  | Command<{ prompt: string }>;

// Responses API input型
interface EasyInputMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
}
interface ToolMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}
type InputMessage = EasyInputMessage | ToolMessage;

const DEFAULT_CONTEXT: ResponseInputItem[] = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
  {
    role: "assistant",
    content: "ぼく、ｽﾀｯｸﾁｬﾝ！お話しよう。",
  },
];

const generateImageCommandFactory: (
  client: OpenAI
) => Command<{ prompt: string }> = (client) => {
  return {
    invoke: async ({ prompt }) => {
      const res = await client.images.generate({
        prompt: `"${prompt}" in super-kawaii style`,
      });
      if (res.created > 0) {
        return res.data?.[0].url;
      }
      return "failed to create"
    },
    tool: {
      type: "function",
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
      strict: true,
    },
  };
};
const cosenseSearchCommand: Command<{ query: string }> = {
  invoke: async ({ query }) => {
    return cosenseService.search(query as string);
  },
  tool: {
    type: "function",
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
    strict: true,
  },
};
const cosenseGetPageTextCommand: Command<{ pageTitle: string }> = {
  invoke: async ({ pageTitle }) => {
    return cosenseService.getPageText(pageTitle as string);
  },
  tool: {
    type: "function",
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
    strict: true,
  },
};

function toResponseInput(messages: ResponseInputItem[]): ResponseInputItem[] {
  // すでにResponseInputItem[]型なのでそのまま返す
  return messages;
}

// Responses APIのchoices型（必要な部分のみ）
type ResponsesApiChoice = {
  message: {
    content: { type: string; text: string }[];
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
};
type ResponsesApiResult = { choices: ResponsesApiChoice[] };

export class ChatService {
  client: OpenAI;
  commands: AnyCommand[];
  constructor(props?: { token?: string }) {
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
    let input: ResponseInputItem[] = [
      ...DEFAULT_CONTEXT,
      {
        role: "user",
        content: message,
      },
    ];
    const tools = this.commands.map((c) => c.tool);
    const TRIAL = [1, 2, 3, 4, 5];
    for await (const _i of TRIAL) {
      const result = await this.client.responses.create({
        model: "o4-mini",
        input,
        tools,
      });
      const choices = (result as unknown as { choices: ResponsesApiChoice[] }).choices;
      const latestChoice = choices[0];
      if (latestChoice.finish_reason === "stop") {
        const contentArr = latestChoice.message.content;
        const content = Array.isArray(contentArr) ? contentArr[0]?.text : latestChoice.message.content;
        if (!content || typeof content !== "string") {
          throw new Error("回答生成に失敗");
        }
        return content;
      }
      if (latestChoice.finish_reason === "tool_calls") {
        const calls = latestChoice.message.tool_calls;
        if (!calls || calls.length === 0) {
          throw new Error("Invalid function call");
        }
        for await (const call of calls) {
          const command = this.commands.find(
            (cmd) => "name" in cmd.tool && cmd.tool.name === call.function.name
          );
          if (!command) {
            throw new Error(`command not found: ${call.function.name}`);
          }
          const args = JSON.parse(call.function.arguments);
          const result = await command.invoke(args);
          const content = typeof result === "string" ? result : JSON.stringify(result);
          input = [
            ...input,
            {
              role: "assistant",
              content,
            },
          ];
        }
      }
    }
    throw new Error("試行回数オーバー");
  }
}
