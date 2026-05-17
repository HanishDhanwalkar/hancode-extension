# TODO

## LEGEND for TODO

- [todo]
- [in-progress]
- [testing]
- [complete]
- [maybe] : in review feature/task

## Backend

- Model Choice
  
  Better local autocomplete models:
    1. Qwen qwen2.5-coder
    1. DeepSeek deepseek-coder
    1. Codeium Windsurf models
    1. StarCoder2
    1. Codestra

- [todo] Trim Existing Prefix

    Example:

    ```python
        if generated.startswith(request.prefix):
        generated = generated[len(request.prefix):]
    ```

- [todo] Add output filtering
  - [todo] Add cleaner:

    ```python
        def clean_completion(text: str) -> str:
            text = text.replace("```python", "")
            text = text.replace("```", "")

            # Remove explanatory prefixes
            bad_prefixes = [
                "Here",
                "Sure",
                "Certainly",
                "Explanation",
            ]

            lines = text.splitlines()

            filtered = []
            for line in lines:
                if any(line.strip().startswith(p) for p in bad_prefixes):
                    continue
                filtered.append(line)

            return "\n".join(filtered)
    ```

- [maybe] Add early stopping during streaming for Ghost text should be SHORT
  - [maybe] Add heuristics:

    Example:
    Stop when:
    1. 2 consecutive newlines
    1. function/class completed
    1. N chars
    1. duplicate line detected
