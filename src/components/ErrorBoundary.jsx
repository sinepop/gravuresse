import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)', padding: 40
        }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>&#9888;</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8, padding: '8px 24px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)', color: 'var(--text-white)', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >Try Again</button>
        </div>
      )
    }
    return this.props.children
  }
}
