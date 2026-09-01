class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { kind: 'count', stat: '힘' };
  }
  renderVals() {
    const stats = ['힘', '지능', '의지', '체력', '창의'].map((s) => ({
      name: s,
      cls: s === this.state.stat ? 'btn sel tap' : 'btn tap',
      pick: () => this.setState({ stat: s }),
    }));
    return {
      isCount: this.state.kind === 'count',
      isBinary: this.state.kind === 'binary',
      pickCount: () => this.setState({ kind: 'count' }),
      pickBinary: () => this.setState({ kind: 'binary' }),
      stats,
    };
  }
}
