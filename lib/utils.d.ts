export declare function escapeRegExp(str: string): string;
export declare function parseTimeToMinutes(timeStr: string): number;
export declare function parseTime(timestamp: number): number;
export declare function getTimeOfDay(hours: number): string;
export declare function detectEnglishLetters(text: string): number;
export declare function trimSlash(url: string): string;
export declare function splitSentences(text: string): string[];
export declare function shouldFilterContent(content: string, blockWords: string[]): boolean;
export declare function probabilisticCheck(probability: number): boolean;
export declare function isErrorWithMessage(error: unknown): error is {
    response: any;
    message: string;
};
export declare function detectEmojis(text: string): number;
export interface TextProcessor {
    process(content: string): string;
}
export declare class TextProcessingPipeline {
    private processors;
    addProcessor(processor: TextProcessor): void;
    run(content: string): string;
}
