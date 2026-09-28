import ts from 'typescript';

export function convexUserKeyedTables(schemaSource: string): string[] {
  const file = ts.createSourceFile('schema.ts', schemaSource, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const definition = innermostCall(node.initializer);
      if (
        definition !== null &&
        ts.isIdentifier(definition.expression) &&
        definition.expression.text === 'defineTable' &&
        declaresUserId(definition.arguments[0])
      ) {
        names.push(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names.sort();
}

function innermostCall(expression: ts.Expression): ts.CallExpression | null {
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    current = current.expression.expression;
  }
  return ts.isCallExpression(current) ? current : null;
}

function declaresUserId(argument: ts.Expression | undefined): boolean {
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) return false;
  return argument.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'userId',
  );
}
