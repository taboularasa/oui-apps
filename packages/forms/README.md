# `@oui/forms`

`@oui/forms` compiles IR form interactions into headless form models and an
accessible default React realization. It supports declarative field types,
permissions, client and BFF validation, command materialization, submission
states, and explicit unsaved-change behavior.

The package owns form semantics and behavior. Controls are rendered through
OUI primitives so customer themes and alternate rendering adapters can replace
presentation without changing the IR contract.
