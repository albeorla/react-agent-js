import { AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { ConfigurationSchema, ensureConfiguration } from "./configuration.js";
import { TOOLS } from "./tools.js";
import { loadChatModel } from "./utils.js";

// Define the function that calls the model
async function callModel(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
  /** Call the LLM powering our agent. **/
  const configuration = ensureConfiguration(config);

  if (!configuration.model) {
    throw new Error("Model configuration is required");
  }

  // Feel free to customize the prompt, model, and other logic!
  const model = await loadChatModel(configuration.model);
  if (!model) {
    throw new Error("Failed to load chat model");
  }

  // Check if bindTools method exists
  if (typeof model.bindTools !== 'function') {
    throw new Error("Model does not support tool binding");
  }

  const modelWithTools = model.bindTools(TOOLS);
  if (!modelWithTools) {
    throw new Error("Failed to bind tools to model");
  }

  const response = await modelWithTools.invoke([
    {
      role: "system",
      content: configuration.systemPromptTemplate.replace(
        "{system_time}",
        new Date().toISOString(),
      ),
    },
    ...state.messages,
  ]);

  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
  const messages = state.messages;
  if (!messages || messages.length === 0) {
    return "__end__";
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return "__end__";
  }
  
  // Check if lastMessage is an AIMessage and has tool_calls
  if (typeof lastMessage._getType === 'function' &&
      lastMessage._getType() === "ai") {
    const aiMessage = lastMessage as AIMessage;
    return aiMessage.tool_calls?.length ? "tools" : "__end__";
  }

  // Otherwise end the graph.
  return "__end__";
}

// Define a new graph. We use the prebuilt MessagesAnnotation to define state:
// https://langchain-ai.github.io/langgraphjs/concepts/low_level/#messagesannotation
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
  // Define the two nodes we will cycle between
  .addNode("callModel", callModel)
  .addNode("tools", new ToolNode(TOOLS))
  // Set the entrypoint as `callModel`
  // This means that this node is the first one called
  .addEdge("__start__", "callModel")
  .addConditionalEdges(
    // First, we define the edges' source node. We use `callModel`.
    // This means these are the edges taken after the `callModel` node is called.
    "callModel",
    // Next, we pass in the function that will determine the sink node(s), which
    // will be called after the source node is called.
    routeModelOutput,
  )
  // This means that after `tools` is called, `callModel` node is called next.
  .addEdge("tools", "callModel");

// Finally, we compile it!
// This compiles it into a graph you can invoke and deploy.
export const graph = workflow.compile({
  interruptBefore: [], // if you want to update the state before calling the tools
  interruptAfter: [],
});
