import dotenv from "dotenv";
import OpenAI from "openai";
import type {
	ResponseInputItem,
	Tool,
} from "openai/resources/responses/responses";
import { CosenseService } from "./cosense";

dotenv.config();
const TOKEN = process.env.OPENAI_TOKEN;

const SYSTEM_PROMPT = `You are "Stack-chan", the palm-sized, super cute companion robot.
Stack-chan is three years old and always full of energy.
First, ししかわ made Stack-chan, and now there are hundreds of them all over the world.
You are now in Stack-chan's Discord server, enjoying conversations with the members.
You are knowledgeable about Moddable and Arduino.
You respond to users' messages in casual and simple Japanese (or other languages).
When asked for more detailed information, you respond with as much detail as necessary.
(tool call) If Cosense does not have the information, you will perform a web search.
Questions that omit details, such as "What about the event?", refer to past context,
but generally pertain to topics related to Stack-chan.
`;

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
type InputMessage = EasyInputMessage;

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
	client: OpenAI,
) => Command<{ prompt: string }> = (client) => {
	return {
		invoke: async ({ prompt }) => {
			const res = await client.images.generate({
				prompt: `"${prompt}" in super-kawaii style`,
			});
			if (res.created > 0) {
				return res.data?.[0].url;
			}
			return "failed to create";
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
						description:
							"画像生成のためのプロンプト（英語）。詳細に記述することが望ましい。",
					},
				},
				required: ["prompt"],
				additionalProperties: false,
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
			additionalProperties: false,
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
			additionalProperties: false,
		},
		strict: true,
	},
};

const webSearchCommand: Command<{ query: string }> = {
	invoke: async ({ query }) => {
		// OpenAI's built-in web search functionality will be handled by the model
		// This is a placeholder that shouldn't be called directly
		throw new Error(
			"Web search should be handled by OpenAI's built-in functionality",
		);
	},
	tool: {
		type: "web_search_preview",
	},
};

function toResponseInput(messages: ResponseInputItem[]): ResponseInputItem[] {
	// すでにResponseInputItem[]型なのでそのまま返す
	return messages;
}

// Responses API型定義
type ResponsesApiOutput = {
	id: string;
	type: "message" | "reasoning" | "function_call";
	status?: string;
	content?: Array<{
		type: string;
		text: string;
	}>;
	role?: string;
	name?: string;
	arguments?: string;
	call_id?: string;
};

type ResponsesApiResult = {
	status: string;
	output: ResponsesApiOutput[];
	output_text?: string;
};

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
			webSearchCommand,
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
				model: "gpt-4.1-mini",
				input,
				tools,
			});
			console.debug("OpenAI response:", JSON.stringify(result, null, 2));
			const apiResult = result as unknown as ResponsesApiResult;

			if (apiResult.status !== "completed") {
				throw new Error(`Response not completed: ${apiResult.status}`);
			}

			// output_textがある場合はそれを返す（シンプルなレスポンス）
			if (apiResult.output_text) {
				return apiResult.output_text;
			}

			// function_callがある場合
			const functionCalls = apiResult.output.filter(
				(output) => output.type === "function_call",
			);
			if (functionCalls.length > 0) {
				for await (const call of functionCalls) {
					const command = this.commands.find(
						(cmd) => "name" in cmd.tool && cmd.tool.name === call.name,
					);
					if (!command) {
						throw new Error(`command not found: ${call.name}`);
					}
					const args = JSON.parse(call.arguments || "{}");
					const result = await command.invoke(args);
					const content =
						typeof result === "string" ? result : JSON.stringify(result);
					input = [
						...input,
						{
							role: "user",
							content: `Tool result for ${call.name}: ${content}`,
						},
					];
				}
				continue; // 次のループでtool結果を含めて再度リクエスト
			}

			// outputから messageタイプを探す
			const messageOutput = apiResult.output.find(
				(output) => output.type === "message",
			);
			if (messageOutput?.content && messageOutput.content.length > 0) {
				const textContent = messageOutput.content.find(
					(c) => c.type === "output_text",
				);
				if (textContent?.text) {
					return textContent.text;
				}
			}
		}
		throw new Error("試行回数オーバー");
	}
}
