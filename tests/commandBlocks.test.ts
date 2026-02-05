import { describe, expect, it } from "vitest";
import { extractCommandBlocks } from "../src/agent/commandBlocks";

describe("extractCommandBlocks", () => {
  it("extracts only supported command blocks and ignores diff/json/text", () => {
    const text = `
some text

\`\`\`diff
--- a/a.txt
+++ b/a.txt
@@
-old
+new
\`\`\`

\`\`\`json
{ "a": 1 }
\`\`\`

\`\`\`bash
cd repo
rg -n "foo" .
\`\`\`

\`\`\`powershell
PS C:\\work> rg -n "bar" .
$ rg -n "baz" .
$env:FOO = "1"
\`\`\`
`;

    const blocks = extractCommandBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.shell).toBe("bash");
    expect(blocks[0]?.lines).toEqual(['cd repo', 'rg -n "foo" .']);

    expect(blocks[1]?.shell).toBe("powershell");
    expect(blocks[1]?.lines).toEqual([
      'rg -n "bar" .',
      'rg -n "baz" .',
      '$env:FOO = "1"'
    ]);
  });

  it("maps cmd/bat and sh to supported shells", () => {
    const text = `
\`\`\`bat
cd /d D:\\repo
rg -n foo .
\`\`\`

\`\`\`sh
rg -n foo .
\`\`\`
`;
    const blocks = extractCommandBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.shell).toBe("cmd");
    expect(blocks[1]?.shell).toBe("bash");
  });
});

