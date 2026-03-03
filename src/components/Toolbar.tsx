import React from 'react';
import { 
  Type, 
  Bold, 
  Code, 
  Link as LinkIcon, 
  List, 
  Quote, 
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Hash
} from 'lucide-react';

interface ToolbarProps {
  onInsert: (text: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onInsert }) => {
  const tools = [
    { icon: Hash, label: 'H1', value: '# ' },
    { icon: Bold, label: 'Bold', value: '**' },
    { icon: Code, label: 'Code', value: '`' },
    { icon: LinkIcon, label: 'Link', value: '[]()' },
    { icon: ImageIcon, label: 'Image', value: '![]()' },
    { icon: List, label: 'List', value: '- ' },
    { icon: Quote, label: 'Quote', value: '> ' },
    { icon: Code, label: 'Block', value: '```\n\n```' },
    { icon: ChevronLeft, label: 'Tag', value: '<>' },
    { icon: ChevronRight, label: 'Arrow', value: '=> ' },
  ];

  return (
    <div className="glass h-12 flex items-center px-2 overflow-x-auto no-scrollbar">
      <div className="flex items-center space-x-1">
        {tools.map((tool, index) => (
          <button
            key={index}
            onClick={() => onInsert(tool.value)}
            className="min-w-[44px] h-10 flex items-center justify-center rounded-lg text-gray-400 active:bg-white/10 active:text-accent transition-all"
          >
            <tool.icon className="w-5 h-5" />
          </button>
        ))}
      </div>
    </div>
  );
};
