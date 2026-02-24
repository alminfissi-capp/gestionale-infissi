import Image from 'next/image'

interface Props {
  icona: string
  size?: 'sm' | 'md' | 'lg'
}

const config = {
  sm: { px: 20, text: 'text-base' },
  md: { px: 28, text: 'text-lg' },
  lg: { px: 32, text: 'text-2xl' },
}

export default function IconaCategoria({ icona, size = 'md' }: Props) {
  const { px, text } = config[size]

  if (icona.startsWith('http')) {
    return (
      <Image
        src={icona}
        alt=""
        width={px}
        height={px}
        className="rounded object-cover shrink-0"
      />
    )
  }

  return <span className={`${text} shrink-0`}>{icona}</span>
}
