import * as vscode from "vscode";
import * as diff from "diff";

async function applyPatch() {
  const workspaceFolder = vscode.workspace.workspaceFolders![0].uri;

  const patch = await vscode.env.clipboard.readText();

  if (!patch) {
    vscode.window.showErrorMessage("No patch data found in clipboard.");
    return;
  }

  const patchWithoutExtendedHeaders = patch
    .split("\n")
    .filter(
      (line) => !line.startsWith("diff --git") && !line.startsWith("index ")
    )
    .join("\n");

  const patchData = diff.parsePatch(patchWithoutExtendedHeaders);

  try {
    const edit = new vscode.WorkspaceEdit();
    for (const patchPart of patchData) {
      if (!patchPart.oldFileName || !patchPart.newFileName) {
        throw new Error("File name not found in the patch.");
      }

      const oldFileUri = vscode.Uri.joinPath(
        workspaceFolder,
        patchPart.oldFileName
      );
      const newFileUri = vscode.Uri.joinPath(
        workspaceFolder,
        patchPart.newFileName
      );

      if (patchPart.oldFileName !== patchPart.newFileName) {
        await vscode.workspace.fs.rename(oldFileUri, newFileUri);
      }

      if (patchPart.hunks.length === 0) {
        await vscode.workspace.fs.delete(newFileUri);
      } else {
        let fileContent;
        try {
          const fileData = await vscode.workspace.fs.readFile(oldFileUri);
          fileContent = fileData.toString();
        } catch (err) {
          if ((err as any).code === "FileNotFound") {
            fileContent = "";
          } else {
            throw err;
          }
        }

        const patchedContent = diff.applyPatch(fileContent, patchPart);

        // @ts-expect-error
        if (patchedContent === false) {
          throw new Error(`Failed to apply patch to ${patchPart.oldFileName}`);
        }

        const patchedContentBuffer = Buffer.from(patchedContent, "utf8");
        await vscode.workspace.fs.writeFile(newFileUri, patchedContentBuffer);
      }
    }

    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage("Patch applied successfully.");
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to apply patch: ${(err as Error).message}`
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "gitPatchClipboard.applyPatch",
    applyPatch
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}
