# hancode-extension

## Test extension

```file-structure
hancode-extension
├── src
|   └── extension.ts
├── tsconfig.json
├── package.json
├── backend
|   ├── src
|   |   ├── llm.py              <- AI engine / LLM client (ollama)
|   └── store
|       └── conversations.json  <- will be replace by DbHandler
└── README.md
```

## Step Up

### Install dependencies

```npm install```

### Build the extension

```npm run compile```

### Run in debugger

In VS Code's Debugger panel, (shortcut F5):
The dev extension comes pre installed

### Commands

Run using ```ctrl + shift + P```

1. Health Check: ```hancode.health```
    Displays health pop-up

## Export extension

1. install VSCE

   ```npm install -g @vscode/vsce```

1. package the extension into `.vsix` file

    ```bash
    cd hancode-extension
    vsce package
    # hancode-extension.vsix generated
    ```

## LLM Backend

TODO
