// NEXUM Self-Modification System - Can rewrite own code and add new tools

import fs from "fs";
import path from "path";

interface ToolDefinition {
  name: string;
  description: string;
  code: string;
  file: string;
}

export const createNewTool = async (
  toolName: string,
  description: string,
  code: string
): Promise<boolean> => {
  try {
    const toolPath = path.join(__dirname, "tools", `${toolName}.ts`);
    
    // Ensure tools directory exists
    const toolsDir = path.join(__dirname, "tools");
    if (!fs.existsSync(toolsDir)) {
      fs.mkdirSync(toolsDir, { recursive: true });
    }
    
    // Write tool file
    const toolCode = `// Auto-generated tool: ${toolName}
// ${description}

${code}

export default {
  name: "${toolName}",
  description: "${description}",
};`;
    
    fs.writeFileSync(toolPath, toolCode);
    
    console.log(`✅ Tool created: ${toolName}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create tool ${toolName}:`, error);
    return false;
  }
};

export const modifyExistingCode = async (
  filePath: string,
  oldCode: string,
  newCode: string
): Promise<boolean> => {
  try {
    const fullPath = path.join(__dirname, filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${filePath}`);
      return false;
    }
    
    const content = fs.readFileSync(fullPath, "utf-8");
    
    if (!content.includes(oldCode)) {
      console.error(`Old code not found in ${filePath}`);
      return false;
    }
    
    const updated = content.replace(oldCode, newCode);
    fs.writeFileSync(fullPath, updated);
    
    console.log(`✅ Modified: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to modify ${filePath}:`, error);
    return false;
  }
};

export const addCommandToBot = async (
  commandName: string,
  commandCode: string
): Promise<boolean> => {
  try {
    const commandsFile = path.join(__dirname, "telegram", "commands.ts");
    
    // Find insertion point (before closing });
    const content = fs.readFileSync(commandsFile, "utf-8");
    const insertPoint = content.lastIndexOf("};");
    
    if (insertPoint === -1) {
      console.error("Could not find insertion point in commands.ts");
      return false;
    }
    
    const updated = 
      content.slice(0, insertPoint) + 
      `\n\n  // Auto-generated command: ${commandName}\n${commandCode}\n` +
      content.slice(insertPoint);
    
    fs.writeFileSync(commandsFile, updated);
    
    console.log(`✅ Command added: ${commandName}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to add command:`, error);
    return false;
  }
};

export const generateToolSuggestion = (userGoal: string): ToolDefinition | null => {
  // Suggest tools based on user needs
  const suggestions: Record<string, ToolDefinition> = {
    "calculator": {
      name: "calculator",
      description: "Perform mathematical calculations",
      file: "tools/calculator.ts",
      code: `export const calculate = (expression: string): number => {
  return eval(expression);
};`,
    },
    "web-fetch": {
      name: "web-fetch",
      description: "Fetch content from websites",
      file: "tools/web-fetch.ts",
      code: `export const fetchUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  return response.text();
};`,
    },
    "json-parse": {
      name: "json-parse",
      description: "Parse and validate JSON",
      file: "tools/json-parse.ts",
      code: `export const parseJSON = (json: string): any => {
  return JSON.parse(json);
};`,
    },
  };
  
  for (const [key, suggestion] of Object.entries(suggestions)) {
    if (userGoal.toLowerCase().includes(key)) {
      return suggestion;
    }
  }
  
  return null;
};
