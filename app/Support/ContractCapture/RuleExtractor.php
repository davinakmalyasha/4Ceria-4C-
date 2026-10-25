<?php

namespace App\Support\ContractCapture;

use Illuminate\Support\Facades\Route;

/**
 * The validation rules of an endpoint, read out of its controller.
 *
 * WHY
 * ---
 * The capture has to send each endpoint a request it would ACCEPT, or the
 * recording is of a 422 — and a 422 says nothing about the endpoint's
 * actual behaviour. The rules are what say which request is acceptable, and
 * they are written down in the controller.
 *
 * So the rules are READ, not guessed and not hand-written. A hand-written
 * body per endpoint would be 213 bodies to keep in step with the
 * controllers, and a body that stopped matching the rules would record a
 * validation error for ever.
 *
 * HOW
 * ---
 * The rules live in `$request->validate([...])` or
 * `Validator::make($request, [...])`, and they are array literals of
 * strings. The controller's source is tokenised, the array literal is
 * located and its pairs are read.
 *
 * Only the LITERAL rules are read. A rule built from a variable is skipped
 * rather than guessed, and the field it belongs to is left out of the
 * request — which means the endpoint answers 422 for that field, and the
 * recording says so.
 */
final class RuleExtractor
{
    /**
     * The rules of a route, by field.
     *
     * @return array<string, list<string>>
     */
    public function forRoute(string $uri, string $method): array
    {
        $action = $this->actionFor($uri, $method);

        if ($action === null) {
            return [];
        }

        return $this->forAction($action);
    }

    /**
     * The rules of a controller action, by field.
     *
     * @return array<string, list<string>>
     */
    public function forAction(string $action): array
    {
        [$class, $method] = array_pad(explode('@', $action), 2, null);

        if ($class === null || $method === null || ! class_exists($class)) {
            return [];
        }

        try {
            $reflection = new \ReflectionMethod($class, $method);
        } catch (\ReflectionException) {
            return [];
        }

        // A FORM REQUEST holds the rules.
        //
        // Nine of the application's endpoints take a `FormRequest` rather
        // than reading the request directly — `StoreProjectRequest` for
        // instance — and the rules live in that class's `rules()` method.
        // The parameter's TYPE says which class it is.
        foreach ($reflection->getParameters() as $parameter) {
            $type = $parameter->getType();

            if (! $type instanceof \ReflectionNamedType || $type->isBuiltin()) {
                continue;
            }

            $requestClass = $type->getName();

            if (! class_exists($requestClass)) {
                continue;
            }

            if (! is_subclass_of($requestClass, \Illuminate\Foundation\Http\FormRequest::class)) {
                continue;
            }

            $rules = $this->forMethod($requestClass, 'rules', true);

            if ($rules !== []) {
                return $rules;
            }
        }

        return $this->forMethod($class, $method);
    }

    /**
     * The rules of a method, read out of its source.
     *
     * @param  bool  $isRulesMethod  True for a `rules()` method, whose rules
     *                               are simply RETURNED rather than
     *                               passed to a validator.
     * @return array<string, list<string>>
     */
    private function forMethod(string $class, string $method, bool $isRulesMethod = false): array
    {
        try {
            $reflection = new \ReflectionMethod($class, $method);
        } catch (\ReflectionException) {
            return [];
        }

        $file = $reflection->getFileName();

        if ($file === false || ! is_file($file)) {
            return [];
        }

        $lines = file($file);

        if ($lines === false) {
            return [];
        }

        $source = implode('', array_slice(
            $lines,
            $reflection->getStartLine() - 1,
            $reflection->getEndLine() - $reflection->getStartLine() + 1,
        ));

        return $this->parse($source, $isRulesMethod);
    }

    /**
     * The controller action of a route.
     */
    private function actionFor(string $uri, string $method): ?string
    {
        foreach (Route::getRoutes() as $route) {
            if ($route->uri() !== $uri) {
                continue;
            }

            if (! in_array(strtoupper($method), $route->methods(), true)) {
                continue;
            }

            $action = $route->getActionName();

            if ($action !== '' && $action !== 'Closure') {
                return $action;
            }
        }

        return null;
    }

    /**
     * Read the rules out of a method's source.
     *
     * @return array<string, list<string>>
     */
    private function parse(string $source, bool $allowReturnedArray = false): array
    {
        // The tokenizer only reads code INSIDE `<?php`, so a method's text —
        // which is a fragment of a file, not a file — has to be given an
        // opening tag. Without it the whole fragment comes back as one
        // T_INLINE_HTML token and there is nothing to read.
        $tokens = token_get_all("<?php\n".$source);

        $count = count($tokens);

        // FIRST: the array that follows a `validate` or a `make` call.
        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];

            if (! is_array($token) || $token[0] !== T_STRING) {
                continue;
            }

            if (! in_array(strtolower($token[1]), ['validate', 'make'], true)) {
                continue;
            }

            $array = $this->findRulesArray($tokens, $i);

            if ($array === null) {
                continue;
            }

            $rules = $this->readPairs($tokens, $array);

            if ($rules !== []) {
                return $rules;
            }
        }

        // SECOND: a `FormRequest`'s `rules()` method simply RETURNS the
        // array, with no call to look for.
        //
        // Only for a `rules()` method: in an ordinary controller the first
        // array literal is often a RESPONSE — `response()->json(['message'
        // => 'Unauthorized'], 403)` — and reading that as the rules would
        // invent a field called `message`.
        if (! $allowReturnedArray) {
            return [];
        }

        for ($i = 0; $i < $count; $i++) {
            if ($tokens[$i] !== '[') {
                continue;
            }

            $end = $this->matchingBracket($tokens, $i);

            if ($end === null) {
                continue;
            }

            $rules = $this->readPairs($tokens, [$i, $end]);

            if ($rules !== []) {
                return $rules;
            }
        }

        return [];
    }

    /**
     * The token range of the rules array that follows a call.
     *
     * The array is the first `[` INSIDE the call's parentheses: for
     * `validate([...])` that is the first argument, and for
     * `Validator::make($request, [...])` it is the second.
     *
     * @param  array<int, array{0: int, 1: string, 2: int}|string>  $tokens
     * @return array{0: int, 1: int}|null  The start and end offsets.
     */
    private function findRulesArray(array $tokens, int $from): ?array
    {
        $count = count($tokens);
        $depth = 0;

        for ($i = $from + 1; $i < $count; $i++) {
            $token = $tokens[$i];

            if ($token === '(') {
                $depth++;
                continue;
            }

            if ($token === ')') {
                if ($depth === 0) {
                    return null;
                }

                $depth--;
                continue;
            }

            if ($token === '[' && $depth >= 1) {
                $end = $this->matchingBracket($tokens, $i);

                if ($end !== null) {
                    return [$i, $end];
                }
            }
        }

        return null;
    }

    /**
     * The offset of the bracket that matches the one at `$start`.
     *
     * @param  array<int, array{0: int, 1: string, 2: int}|string>  $tokens
     */
    private function matchingBracket(array $tokens, int $start): ?int
    {
        $depth = 0;
        $count = count($tokens);

        for ($i = $start; $i < $count; $i++) {
            $token = $tokens[$i];

            if ($token === '[' || $token === '(') {
                $depth++;
                continue;
            }

            if ($token === ']' || $token === ')') {
                $depth--;

                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return null;
    }

    /**
     * Is the token after `$index` the `=>` arrow?
     *
     * The whitespace is a token of its own, so the arrow is the next token
     * that is not whitespace.
     *
     * @param  array<int, array{0: int, 1: string, 2: int}|string>  $tokens
     */
    private function isArrowAfter(array $tokens, int $index): bool
    {
        $count = count($tokens);

        for ($i = $index + 1; $i < $count && $i <= $index + 3; $i++) {
            $token = $tokens[$i];

            if (is_array($token) && $token[0] === T_WHITESPACE) {
                continue;
            }

            if (is_array($token)) {
                return $token[0] === T_DOUBLE_ARROW;
            }

            return $token === '=>';
        }

        return false;
    }

    /**
     * Read the `field => rules` pairs out of the array literal.
     *
     * A field's rules are either one string — `'required|string|max:255'` —
     * or an array of strings — `['required', 'string']`. Both are read; a
     * rules value that is neither (a variable, a constant) is skipped, and
     * the field is left out of the request so the endpoint says so itself.
     *
     * @param  array<int, array{0: int, 1: string, 2: int}|string>  $tokens
     * @return array<string, list<string>>
     */
    private function readPairs(array $tokens, array $range): array
    {
        [$start, $end] = $range;

        $rules = [];
        $field = null;

        for ($i = $start + 1; $i < $end; $i++) {
            $token = $tokens[$i];

            if (is_array($token) && $token[0] === T_CONSTANT_ENCAPSED_STRING) {
                $value = $token[1];

                // Is this a KEY or a RULE? The key is followed by `=>`.
                //
                // The whitespace between them is a token of its own, so the
                // arrow is the next token that is not whitespace.
                //
                // `=>` is a MULTI-character token, so the tokenizer returns
                // it as an array — the single-character tokens like `(` and
                // `,` come back as strings.
                if ($this->isArrowAfter($tokens, $i)) {
                    $field = trim($value, "'\"");
                    continue;
                }

                if ($field !== null) {
                    $rules[$field][] = $value;
                }

                continue;
            }

            if (is_array($token) && $token[0] === T_ARRAY) {
                // The rules as an array: `['required', 'string']`.
                $inner = $this->matchingBracket($tokens, $i);

                if ($inner !== null && $field !== null) {
                    for ($j = $i + 1; $j < $inner; $j++) {
                        $innerToken = $tokens[$j];

                        if (is_array($innerToken) && $innerToken[0] === T_CONSTANT_ENCAPSED_STRING) {
                            $rules[$field][] = $innerToken[1];
                        }
                    }
                }

                $i = $inner ?? $i;
                continue;
            }
        }

        return $rules;
    }
}
