import { AbstractParser, EnclosingContext } from "../../constants";
import { spawn } from 'child_process';
import * as path from 'path';

export class PythonParser implements AbstractParser {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(__dirname, 'python_parser.py');
  }

  async findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): Promise<EnclosingContext> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [
        this.pythonScriptPath,
        file,
        lineStart.toString(),
        lineEnd.toString()
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      }); 

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      }); 

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const context = JSON.parse(output);
            resolve({ enclosingContext: context } as EnclosingContext);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${error}`));
          }
        } else {
          reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
        }
      });
    });
  }
  async dryRun(file: string): Promise<{ valid: boolean; error: string }> {
    
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['-c', `
    import ast
    
    try:
        with open('${file})', 'r') as f:
            ast.parse(f.read())
        print('{"valid": true, "error": ""}')
    except Exception as e:
        print('{"valid": false, "error": "' + str(e).replace('"', '\\"') + 
        '"}')`
      ]);

      let output = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${error}`));
          }
        } else {
          reject(new Error(`Python script exited with code ${code}`));
        }
      });
    });
  }
}
