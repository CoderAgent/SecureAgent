import ast
import sys
import json

def find_enclosing_context(file_content, line_start, line_end):
    tree = ast.parse(file_content)

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
            if node.lineno <= self.line_start and self.line_end <= node.end_lineno:
                size = node.end_lineno - node.lineno
                if size > self.largest_size:
                    self.largest_size = size
                    self.largest_context = node

    finder = ContextFinder(line_start, line_end)
    finder.visit(tree)

    if finder.largest_context:
        return { 
            "type": finder.largest_context.__class__.__name__,
            "name": finder.largest_context.name,
            "start_line": finder.largest_context.lineno,
            "end_line": finder.largest_context.end_lineno
        }
    
    return None

def main():
    file_path = sys.argv[1]
    line_start = int(sys.argv[2])
    line_end = int(sys.argv[3])

    with open(file_path, 'r') as file:
        file_content = file.read()

    context = find_enclosing_context(file_content, line_start, line_end)
    print(json.dumps(context))

if __name__ == "__main__":
    main()