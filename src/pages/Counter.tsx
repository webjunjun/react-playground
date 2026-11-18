import { useCounterStore } from '@/store/counter'

function Counter() {
  const { count, increment, decrement, reset } = useCounterStore()

  return (
    <section>
      <h1>Zustand Demo</h1>
      <p>全局状态计数器，展示 zustand 的基本用法：</p>
      <h2>{count}</h2>
      <button type="button" onClick={increment}>+1</button>
      <button type="button" onClick={decrement}>-1</button>
      <button type="button" onClick={reset}>reset</button>
    </section>
  )
}

export default Counter
