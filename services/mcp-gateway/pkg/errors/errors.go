package errors

import "errors"

type ErrorCode string

const (
	ErrCodeValidation       ErrorCode = "VALIDATION_ERROR"
	ErrCodeServerNotFound   ErrorCode = "SERVER_NOT_FOUND"
	ErrCodeToolNotFound     ErrorCode = "TOOL_NOT_FOUND"
	ErrCodeTimeout          ErrorCode = "TIMEOUT_ERROR"
	ErrCodeServerNotRunning ErrorCode = "SERVER_NOT_RUNNING"
	ErrCodeServerCrashed    ErrorCode = "SERVER_CRASHED"
	ErrCodeToolExecution    ErrorCode = "TOOL_EXECUTION_ERROR"
	ErrCodeInternal         ErrorCode = "INTERNAL_ERROR"
)

var (
	ErrServerNotFound   = errors.New("server not found")
	ErrServerNotRunning = errors.New("server not running")
	ErrToolNotFound     = errors.New("tool not found")
)
