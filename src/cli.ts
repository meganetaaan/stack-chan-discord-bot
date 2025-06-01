import { createInterface } from "node:readline";
import dotenv from "dotenv";
import { ChatService } from "./services/chat";

dotenv.config();

const chatService = new ChatService();

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("=== Stack-chan CLI Test Interface ===");
console.log("Type 'exit' or 'quit' to end the session\n");

function prompt() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log("Goodbye!");
      rl.close();
      return;
    }

    if (input.trim() === "") {
      prompt();
      return;
    }

    try {
      process.stdout.write("Stack-chan: ");
      const response = await chatService.invoke(input);
      console.log(response);
    } catch (error) {
      if (error instanceof Error) {
        console.log(`Error: ${error.message}`);
      } else {
        console.log("Unknown error occurred");
      }
    }
    
    console.log();
    prompt();
  });
}

prompt();