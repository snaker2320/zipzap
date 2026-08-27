import { Command, InvalidArgumentError, Option } from "commander";

export function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
}

export function nonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("must be a non-negative integer");
  }
  return parsed;
}

function commanderUsageError(error, command, executable) {
  const help = command
    ? `Run \`${executable} ${command} --help\` for command usage.`
    : `Run \`${executable} --help\` to list available commands.`;
  if (error.code === "commander.unknownCommand") {
    return {
      code: "unknown-command",
      message: error.message.replace(/^error:\s*/i, ""),
      hint: help
    };
  }
  if (error.code === "commander.optionMissingArgument") {
    const flag = error.message.match(/option '([^']+)'/)?.[1]?.split(/[ <[]/)[0];
    return {
      code: "missing-option-value",
      message: `${flag ?? "Option"} requires a value.`,
      hint: help
    };
  }
  if (error.code === "commander.unknownOption") {
    return {
      code: "unknown-argument",
      message: error.message.replace(/^error:\s*/i, ""),
      hint: help
    };
  }
  if (error.code === "commander.invalidArgument") {
    return {
      code: "invalid-option-value",
      message: error.message.replace(/^error:\s*/i, ""),
      hint: help
    };
  }
  return {
    code: "invalid-arguments",
    message: error.message.replace(/^error:\s*/i, ""),
    hint: help
  };
}

export function parseMetadataCli({
  argv,
  commands,
  executable,
  description,
  optionSpecs,
  defaults = {}
}) {
  const normalized = [...argv];
  if (normalized[0] === "help") {
    const subject = normalized[1];
    if (!subject) return { ...defaults, command: null, help: true };
    normalized.splice(0, 2, subject, "--help");
  }
  if (
    normalized.length === 0 ||
    normalized[0] === "-h" ||
    normalized[0] === "--help"
  ) {
    return { ...defaults, command: null, help: true };
  }

  const program = new Command();
  program
    .name(executable)
    .description(description)
    .helpOption(false)
    .addHelpCommand(false)
    .exitOverride()
    .configureOutput({
      writeOut() {},
      writeErr() {},
      outputError() {}
    });

  let selected = null;
  for (const [name, metadata] of Object.entries(commands)) {
    const command = program
      .command(metadata.argument ? `${name} [subject]` : name)
      .description(metadata.summary)
      .helpOption(false)
      .allowUnknownOption(false)
      .allowExcessArguments(false)
      .addOption(new Option("-h, --help", "show command help"))
      .addOption(new Option("--example", "print representative JSON input"));
    for (const spec of optionSpecs) {
      const option = new Option(spec.flags, spec.description);
      if (spec.parser) option.argParser(spec.parser);
      command.addOption(option);
    }
    if (metadata.argument) {
      command.action((subject, options) => {
        selected = { command: name, subject: subject ?? null, ...options };
      });
    } else {
      command.action((options) => {
        selected = { command: name, subject: null, ...options };
      });
    }
  }

  try {
    program.parse(normalized, { from: "user" });
  } catch (error) {
    const details = commanderUsageError(error, normalized[0] ?? null, executable);
    const wrapped = new Error(details.message);
    Object.assign(wrapped, details);
    throw wrapped;
  }
  return { ...defaults, ...selected };
}
