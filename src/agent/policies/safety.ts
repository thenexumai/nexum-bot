export enum ActionRisk {
    SAFE = 'SAFE',
    SENSITIVE = 'SENSITIVE',
    DANGEROUS = 'DANGEROUS'
}

export const getActionRisk = (action: string, args: any): ActionRisk => {
    switch (action) {
        case 'screenshot':
        case 'list_files':
        case 'read_file':
            return ActionRisk.SAFE;

        case 'mouse_move':
        case 'click':
        case 'key_press':
        case 'type_text':
        case 'write_file':
            return ActionRisk.SENSITIVE;

        case 'shell':
        case 'delete_file':
            // Дополнительная проверка shell команд
            if (args.command && (args.command.includes('rm ') || args.command.includes('del ') || args.command.includes('format '))) {
                return ActionRisk.DANGEROUS;
            }
            return ActionRisk.DANGEROUS;

        default:
            return ActionRisk.DANGEROUS;
    }
};
