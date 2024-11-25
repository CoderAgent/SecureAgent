import ast
import sys
import json

def find_enclosing_context(file_content, line_start, line_end):
    try:
        tree = ast.parse(file_content)
    except SyntaxError as e:
        return {"error": f"Syntax error in the file: {e}"}

    class ContextFinder(ast.NodeVisitor):
        def __init__(self, line_start, line_end):
            self.line_start = line_start
            self.line_end = line_end
            self.largest_context = None
            self.largest_size = 0

        def visit_FunctionDef(self, node):
            self.check_node(node)
            self.generic_visit(node)

        def visit_ClassDef(self, node):
            self.check_node(node)
            self.generic_visit(node)

        def check_node(self, node):
            if hasattr(node, 'end_lineno') and node.lineno <= self.line_start and self.line_end <= node.end_lineno:
                size = node.end_lineno - node.lineno
                if size > self.largest_size:
                    self.largest_size = size
                    self.largest_context = node

    finder = ContextFinder(line_start, line_end)
    finder.visit(tree)

    if finder.largest_context:
        return {
            "type": finder.largest_context.__class__.__name__,
            "name": getattr(finder.largest_context, 'name', None),
            "start_line": finder.largest_context.lineno,
            "end_line": getattr(finder.largest_context, 'end_lineno', None)
        }

    return {"error": "No enclosing context found"}

def main():
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Usage: python python_parser.py <file_path> <line_start> <line_end>"}))
        return

    file_path = sys.argv[1]
    try:
        line_start = int(sys.argv[2])
        line_end = int(sys.argv[3])
    except ValueError:
        print(json.dumps({"error": "Line numbers must be integers"}))
        return

    try:
        with open(file_path, 'r') as file:
            file_content = file.read()
    except FileNotFoundError:
        print(json.dumps({"error": f"File not found: {file_path}"}))
        return

    context = find_enclosing_context(file_content, line_start, line_end)
    print(json.dumps(context, indent=4))

if __name__ == "__main__":
    main()
